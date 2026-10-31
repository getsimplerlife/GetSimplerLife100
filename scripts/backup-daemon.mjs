#!/usr/bin/env bun
/**
 * backup-daemon.mjs — SLICE 149. The supervised loop that makes "hourly, no
 * human required" true on the machine that actually holds DATA_DIR.
 *
 *   bun scripts/backup-daemon.mjs                  # hourly, forever
 *   BACKUP_INTERVAL_MS=90000 bun …                 # shorter cadence (proofs, drills)
 *   R2_INSTANCE=host-primary bun …                 # explicit off-box identity
 *
 * WHY A SIBLING PROCESS AND NOT THE SERVER'S TIMER: the acceptance for this slice
 * is a run that completes while the web process is STOPPED. A timer inside the
 * web process cannot do that, and the published deployment sleeps when idle. So
 * the loop lives beside the server, not inside it: killing the listener does not
 * stop it, and the published site being asleep does not matter.
 *
 * HOW IT IS KEPT ALIVE: `scripts/ensure-backup-daemon.mjs` starts it detached
 * (own session, no controlling terminal) and is itself called on every dev-server
 * boot — so the loop comes back after a box restart or a crash, without a human.
 * Only ONE loop can exist per archive root: it holds `.backup-daemon.lock`, and a
 * second loop exits immediately.
 *
 * WHAT ONE TICK IS: spawn `bun scripts/backup.mjs` as a CHILD process and wait
 * for it. Out of process on purpose — the run then cannot corrupt this loop's
 * memory, and the CLI is the exact same code path a human would type. The child
 * takes the run lock, so a tick that coincides with the server's own scheduler or
 * a manual run is refused rather than doubled.
 *
 * EVERY TICK IS OBSERVABLE: `.backup-daemon.json` (heartbeat: pid, interval,
 * ticks, last exit code, next run time, and — booleans only — whether the off-box
 * variables are visible) plus one structured `[backup][daemon]` line per tick.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DAEMON_INSTANCE,
  EXIT_REFUSED,
  acquireLock,
  daemonLockPath,
  nextRunDelayMs,
  releaseLock,
  writeDaemonHeartbeat,
} from "./lib/backup-daemon.ts";
import { backupEventLine } from "../src/lib/backup-status.ts";
import { resolveBackupInterval } from "../src/lib/backup-scheduler.ts";
import { describeR2Config, resolveUploadPrefix } from "../src/lib/r2-upload.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_DIR = resolve(process.env.DATA_DIR?.trim() || join(REPO_ROOT, ".data"));
const OUT_DIR = resolve(process.env.BACKUP_ROOT?.trim() || "/home/team/shared/backups");
const INTERVAL_MS = resolveBackupInterval(process.env);
const FIRST_DELAY_MS = (() => {
  const n = Number(process.env.BACKUP_FIRST_DELAY_MS);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
})();
/**
 * SLICE 149 — the identity this box uploads under, set EXPLICITLY.
 *
 * Slice 147 skips the upload when a runtime identifies as dev/test and the
 * operator has named no namespace. That guard is right for tests, but the only
 * listener on this machine is `vite dev`, so inheriting its `NODE_ENV` would
 * silently switch off the real off-box copy on the box that holds the data.
 * Naming the instance makes the intent explicit and makes the guard's
 * `explicitOverride` path the one that applies. `NODE_ENV` is dropped from the
 * child for the same reason: this loop is not a dev or test runtime.
 */
const INSTANCE = (process.env.R2_INSTANCE || "").trim() || DEFAULT_DAEMON_INSTANCE;

const CHILD_ENV = { ...process.env, R2_INSTANCE: INSTANCE };
delete CHILD_ENV.NODE_ENV;
delete CHILD_ENV.VITEST;

const LOG_PREFIX = "[backup][daemon]";
function log(msg) {
  console.log(`${LOG_PREFIX} ${msg}`);
}
function event(name, fields) {
  console.log(backupEventLine(name, fields));
}

/** What the loop can see of the off-box leg. Booleans and names only. */
function envReport() {
  try {
    const report = describeR2Config(CHILD_ENV, { dataDir: DATA_DIR });
    const resolved = resolveUploadPrefix({ env: CHILD_ENV, dataDir: DATA_DIR, create: false });
    return {
      r2Configured: report.configured,
      missing: report.missing,
      passphraseSet: !!String(CHILD_ENV.BACKUP_PASSPHRASE || "").trim(),
      instance: resolved.instance,
      instanceSource: resolved.instanceSource,
      prefix: resolved.prefix,
      uploadAllowed: resolved.uploadAllowed,
      uploadSkipReason: resolved.skipReason,
    };
  } catch (e) {
    log(`could not inspect the off-box configuration: ${e?.message || e}`);
    return null;
  }
}

// ── One loop per archive root ───────────────────────────────────────────────
const lockPath = daemonLockPath(OUT_DIR);
const lock = acquireLock({ path: lockPath, reason: `backup-daemon interval=${INTERVAL_MS}ms` });
if (!lock.ok) {
  log(`NOT STARTING — another loop supervises ${OUT_DIR}: ${lock.reason}`);
  console.log(
    JSON.stringify({ ok: true, started: false, reason: "already-supervised", holder: lock.holder, path: lock.path }, null, 2),
  );
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
const startedAt = new Date();
let ticks = 0;
let lastRunStartedAt = null;
let lastRunEndedAt = null;
let lastExitCode = null;
let nextRunAt = null;
let stopping = false;

const ENV = envReport();
log(`supervising ${DATA_DIR} → ${OUT_DIR} every ${INTERVAL_MS}ms (first run in ${FIRST_DELAY_MS}ms), pid ${process.pid}`);
log(`off-box identity: instance=${ENV?.instance ?? "<none>"} (${ENV?.instanceSource ?? "?"}) prefix=${ENV?.prefix ?? "<none>"} allowed=${ENV?.uploadAllowed} configured=${ENV?.r2Configured} passphrase=${ENV?.passphraseSet}`);
if (ENV && !ENV.uploadAllowed) {
  event("upload-would-be-skipped", { instance: ENV.instance, reason: ENV.uploadSkipReason });
}

function beat() {
  const hb = {
    pid: process.pid,
    state: stopping ? "stopped" : "running",
    startedAt: startedAt.toISOString(),
    updatedAt: new Date().toISOString(),
    intervalMs: INTERVAL_MS,
    firstDelayMs: FIRST_DELAY_MS,
    ticks,
    lastRunStartedAt,
    lastRunEndedAt,
    lastExitCode,
    nextRunAt,
    env: ENV,
  };
  writeDaemonHeartbeat(OUT_DIR, hb);
}
beat();

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  nextRunAt = null;
  beat();
  log(`stopping on ${signal}; the next loop (or the server) will pick the cadence up`);
  releaseLock(lockPath);
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("exit", () => {
  // Belt and braces: a lock left behind by an unexpected exit would block every
  // future loop until someone noticed. A dead pid is also detectable, but an
  // explicit release is cheaper to reason about.
  try {
    releaseLock(lockPath);
  } catch {
    /* nothing useful to do while exiting */
  }
});

/** Interruptible sleep, so a signal does not have to wait out an hour. */
async function sleep(ms) {
  const until = Date.now() + ms;
  while (!stopping && Date.now() < until) {
    await new Promise((r) => setTimeout(r, Math.min(1000, Math.max(0, until - Date.now()))));
  }
}

/** Run the CLI once, in a child process, and wait for it. Never throws. */
function runOnce() {
  return new Promise((resolvePromise) => {
    const args = [join(REPO_ROOT, "scripts", "backup.mjs"), "--data-dir", DATA_DIR, "--out", OUT_DIR];
    let child;
    try {
      child = spawn(process.execPath, args, { cwd: REPO_ROOT, env: CHILD_ENV, stdio: ["ignore", "inherit", "inherit"] });
    } catch (e) {
      log(`could not spawn the backup CLI: ${e?.message || e}`);
      resolvePromise(1);
      return;
    }
    child.on("error", (e) => {
      log(`backup CLI error: ${e?.message || e}`);
      resolvePromise(1);
    });
    child.on("exit", (code, signal) => {
      resolvePromise(typeof code === "number" ? code : signal ? 1 : 0);
    });
  });
}

while (!stopping) {
  const nowMs = Date.now();
  const delay = nextRunDelayMs({
    nowMs,
    ticks,
    lastRunStartedAtMs: lastRunStartedAt ? Date.parse(lastRunStartedAt) : null,
    intervalMs: INTERVAL_MS,
    firstDelayMs: FIRST_DELAY_MS,
  });
  nextRunAt = new Date(nowMs + delay).toISOString();
  beat();
  await sleep(delay);
  if (stopping) break;

  const startedIso = new Date().toISOString();
  lastRunStartedAt = startedIso;
  ticks += 1;
  nextRunAt = null;
  beat();
  const t0 = Date.now();
  const code = await runOnce();
  lastRunEndedAt = new Date().toISOString();
  lastExitCode = code;
  const ms = Date.now() - t0;
  if (code === 0) {
    event("daemon-tick", { tick: ticks, exitCode: 0, ms, startedAt: startedIso, instance: ENV?.instance ?? null });
  } else if (code === EXIT_REFUSED) {
    // Not a failure: another run (the server's scheduler, or a human) held the
    // run lock. Nothing is written to backup_status.json because nothing failed.
    event("daemon-tick-refused", { tick: ticks, exitCode: code, ms, startedAt: startedIso, reason: "another backup run held the lock" });
  } else {
    event("daemon-tick-failed", { tick: ticks, exitCode: code, ms, startedAt: startedIso, reason: "see the [backup] lines above; backup_status.json records the failure" });
  }
  beat();
}

log(`loop ended after ${ticks} tick(s)`);
