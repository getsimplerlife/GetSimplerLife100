/**
 * Single-instance guard for the production server (recurring-outage hardening).
 *
 * Problem being solved: a stray prod-server started from a dev checkout kept
 * seizing port 3000, forcing the canonical live server into EADDRINUSE
 * restart-loops, so the refresher/sweepers/heartbeat on the OWNING instance ran
 * (or starved), and Xero's token expired with no renewal.
 *
 * Goal (fail-fast, fail-closed): before the refresher/sweepers/heartbeat ever
 * start, assert that THIS process is the sole owning instance. If the canonical
 * port is already bound by another process, or another live prod-server instance
 * holds the ownership lock, exit loudly with a clear reason — a non-owning
 * instance must NEVER start the background loop workers.
 *
 * Mechanism: an exclusive (O_EXCL) ownership lock file in DATA_DIR carrying
 * { pid, port, startedAt }. A second instance that finds a LIVE lock (the PID
 * still exists) refuses to start. A stale lock (dead PID) is reclaimed so an
 * actual restart can proceed.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync, openSync } from "fs";
import { join } from "path";
import { connect } from "net";

export interface OwnershipAcquisition {
  ok: boolean;
  reason?: string;
  /** Call only on graceful shutdown; best-effort. */
  release?: () => void;
}

/**
 * Best-effort check: is something already accepting TCP connections on
 * 127.0.0.1:port? Used as a fast pre-flight before we take the ownership lock,
 * so we exit loudly instead of entering the EADDRINUSE restart-loop.
 */
export function portAlreadyBound(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ host: "127.0.0.1", port });
    const done = (bound: boolean) => {
      sock.destroy();
      resolve(bound);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    // ESRCH = no such process (dead) → not alive. EPERM = exists but no perms → alive.
    return e?.code === "EPERM";
  }
}

/**
 * Acquire the single-instance ownership lock for this server, fail-fast.
 *
 * Returns { ok:false, reason } if another LIVE owning instance exists or the
 * lock cannot be safely reclaimed. On success returns { ok:true, release }.
 */
export function acquireSingleInstanceOwnership(
  dataDir: string,
  port: number,
  opts: { lockFileName?: string; now?: () => number } = {},
): OwnershipAcquisition {
  const lockFile = join(dataDir, opts.lockFileName || "prod-server.lock");
  const now = (opts.now ?? Date.now)();
  const payload = JSON.stringify({ pid: process.pid, port, startedAt: new Date(now).toISOString() });

  // Already locked?
  if (existsSync(lockFile)) {
    let existing: { pid?: number } = {};
    try {
      existing = JSON.parse(readFileSync(lockFile, "utf-8"));
    } catch {
      existing = {};
    }
    const ownerPid = existing?.pid;
    if (ownerPid != null && ownerPid !== process.pid && pidAlive(ownerPid)) {
      return {
        ok: false,
        reason: `another live prod-server instance holds ownership lock ${lockFile} (pid=${ownerPid}); refusing to start background workers from a non-owning instance`,
      };
    }
    // Stale lock (owner dead or unreadable) → reclaim so a real restart can boot.
    try { unlinkSync(lockFile); } catch { /* best effort */ }
  }

  // Take ownership exclusively (O_EXCL): if two boot simultaneously, only one wins.
  let fd: number;
  try {
    fd = openSync(lockFile, "wx");
    writeFileSync(fd, payload, "utf-8");
  } catch (e: any) {
    if (e?.code === "EEXIST") {
      return { ok: false, reason: `ownership lock ${lockFile} raced (EEXIST); another instance won; exiting` };
    }
    return { ok: false, reason: `could not acquire ownership lock ${lockFile}: ${e?.message || String(e)}` };
  }
  try { fd > 2 && (import("fs").then((m) => m.closeSync(fd))); } catch { /* best effort */ }

  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      // Only the owner removes the lock, and only if it still names us.
      try {
        if (existsSync(lockFile)) {
          const cur = JSON.parse(readFileSync(lockFile, "utf-8"));
          if (cur?.pid === process.pid) unlinkSync(lockFile);
        }
      } catch { /* best effort */ }
    },
  };
}
