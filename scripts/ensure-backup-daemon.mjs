#!/usr/bin/env bun
/**
 * ensure-backup-daemon.mjs — SLICE 149. Idempotent "there is a backup loop".
 *
 * Called on every dev-server boot (vite.config.ts) so the loop comes back after
 * a machine restart or a crash without a human. Safe to call any number of times
 * and from anywhere: if a loop is already supervising this archive root it says
 * so and exits 0.
 *
 *   bun scripts/ensure-backup-daemon.mjs           # start if not running
 *   BACKUP_DAEMON_DISABLE=1 bun …                  # no-op (tests, drills)
 *
 * It starts the loop DETACHED — its own session, no controlling terminal, stdio
 * to a log file — so the loop is not a child of the web process and does not die
 * when the listener is stopped or restarted. That property is the whole point:
 * the acceptance for this slice is a run that completes while the web process is
 * down.
 *
 * Never fails the caller. A backup supervisor that can break the site boot is
 * worse than no supervisor.
 */
import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { daemonStatus } from "./lib/backup-daemon.ts";
import { isInsidePublishTree } from "./lib/backup-core.ts";
import { resolveBackupInterval } from "../src/lib/backup-scheduler.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_DIR = resolve(process.env.DATA_DIR?.trim() || join(REPO_ROOT, ".data"));
const OUT_DIR = resolve(process.env.BACKUP_ROOT?.trim() || "/home/team/shared/backups");
const INTERVAL_MS = resolveBackupInterval(process.env);
/** 3 = refusal-to-run, the same code the CLI and the loop use for a refusal. */
const EXIT_REFUSED = 3;
const LOG_FILE = join(REPO_ROOT, ".run", "backup-daemon.log");

function log(msg) {
  console.log(`[backup][ensure] ${msg}`);
}

if (process.env.VITEST || process.env.BACKUP_DAEMON_DISABLE === "1") {
  log("skipped: disabled for this runtime");
  process.exit(0);
}

// ── SLICE 149b: same ordering rule as the CLI and the loop ──────────────────
// This script creates `.run/` and spawns a process whose first act is to create
// the archive root. Both are writes, so the publish-tree refusal has to happen
// above them: a loop told to archive into the publish tree must be refused
// before anything — a directory, a lock, a heartbeat — exists to be published.
if (isInsidePublishTree(OUT_DIR)) {
  log(`refusing to supervise a backup root inside the publish tree: ${OUT_DIR} (nothing started)`);
  console.log(
    JSON.stringify({ ok: false, started: false, reason: "publish-tree", outDir: OUT_DIR, wrote: "nothing" }, null, 2),
  );
  process.exit(EXIT_REFUSED);
}
if (OUT_DIR === DATA_DIR || OUT_DIR.startsWith(DATA_DIR + "/")) {
  log(`refusing to supervise an archive root inside DATA_DIR: ${OUT_DIR} (nothing started)`);
  console.log(
    JSON.stringify({ ok: false, started: false, reason: "inside-data-dir", outDir: OUT_DIR, wrote: "nothing" }, null, 2),
  );
  process.exit(EXIT_REFUSED);
}

const before = daemonStatus({ outDir: OUT_DIR, intervalMs: INTERVAL_MS });
if (before.alive) {
  log(`already supervised: pid ${before.pid} (${before.reason})`);
  process.exit(0);
}

try {
  mkdirSync(join(REPO_ROOT, ".run"), { recursive: true });
  const fd = openSync(LOG_FILE, "a");
  // A LOGIN shell on purpose: the loop needs the owner's R2 credentials and the
  // BACKUP_PASSPHRASE, which live in the environment (/etc/profile.d), not in
  // any file this repo owns. `exec` so the pid we spawn IS the loop.
  const child = spawn("/bin/bash", ["-lc", `exec bun ${JSON.stringify(join(REPO_ROOT, "scripts", "backup-daemon.mjs"))}`], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ["ignore", fd, fd],
    env: { ...process.env },
  });
  child.on("error", (e) => log(`spawn error: ${e?.message || e}`));
  child.unref();
  closeSync(fd);
  log(`started a detached loop (spawned pid ${child.pid ?? "?"}); log ${LOG_FILE}`);
} catch (e) {
  log(`could not start the loop: ${e?.message || e}`);
  process.exit(0);
}

// Confirm rather than assume: the loop must have written its lock and heartbeat.
await new Promise((r) => setTimeout(r, 2000));
const after = daemonStatus({ outDir: OUT_DIR, intervalMs: INTERVAL_MS });
log(after.alive ? `confirmed: pid ${after.pid} (${after.reason})` : `NOT confirmed after 2s: ${after.reason}`);
process.exit(0);
