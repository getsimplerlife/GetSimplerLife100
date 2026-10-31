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
import { resolveBackupInterval } from "../src/lib/backup-scheduler.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT_DIR = resolve(process.env.BACKUP_ROOT?.trim() || "/home/team/shared/backups");
const INTERVAL_MS = resolveBackupInterval(process.env);
const LOG_FILE = join(REPO_ROOT, ".run", "backup-daemon.log");

function log(msg) {
  console.log(`[backup][ensure] ${msg}`);
}

if (process.env.VITEST || process.env.BACKUP_DAEMON_DISABLE === "1") {
  log("skipped: disabled for this runtime");
  process.exit(0);
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
