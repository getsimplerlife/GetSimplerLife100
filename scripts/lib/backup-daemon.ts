/**
 * backup-daemon.ts — SLICE 149. The clock that actually runs.
 *
 * WHY THIS EXISTS: slices 143–147 built a correct, verified, coverage-checked,
 * encrypted, off-box backup pipeline and a scheduler that runs it hourly. Both
 * were true and both were useless on the box that holds the data, because
 * `startBackupScheduler` is only wired into `prod-server.ts`, and the listener
 * here is `vite dev`. Measured on 2026-10-31: the newest off-box object was
 * ~7 hours old. The plan said "hourly, no human required"; that was not true.
 *
 * WHAT THIS IS: the small, testable core of a SUPERVISED LOOP that lives beside
 * the web process, not inside it. `scripts/backup-daemon.mjs` is the runner; it
 * calls into this module for every decision it has to make:
 *
 *   - a cross-process RUN LOCK, so two backup runs (the daemon, the in-server
 *     scheduler, a human typing the CLI) can never overlap. A refusal is NOT a
 *     failure: it writes no status, because nothing went wrong;
 *   - a DAEMON LOCK, so two loops cannot both exist for the same archive root;
 *   - a HEARTBEAT file, so "is the loop alive?" is answerable from outside the
 *     loop (the server uses it to step aside instead of double-scheduling);
 *   - the next-delay arithmetic, so the cadence is a fixed rate rather than a
 *     sleep that drifts.
 *
 * WHY NOT the in-server scheduler (option (a) in the brief): the acceptance for
 * this slice is a run that completes WHILE THE WEB PROCESS IS STOPPED. A timer
 * inside the web process cannot satisfy that by construction, and the published
 * deployment sleeps when idle, so it cannot carry the cadence either. The loop
 * has to be a sibling, not a child.
 *
 * WHY NOT systemd/cron: verified on this box on 2026-10-31 — PID 1 is
 * `entrypoint.sh` (no systemd), and there is no `crontab` binary. A timer that
 * is not actually running is the exact failure this slice exists to fix.
 *
 * NOTHING HERE THROWS. Every function returns a value that says what happened;
 * the runner logs it. A backup feature that can take down the thing it protects
 * is worse than no backup feature.
 */
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { atomicWriteSync } from "../../src/lib/atomic-write";

/** Held for the duration of one run, by whichever process is running it. */
export const RUN_LOCK_FILE = ".backup-run.lock";
/** Held for the lifetime of the supervising loop. */
export const DAEMON_LOCK_FILE = ".backup-daemon.lock";
/** Rewritten after every tick, so liveness is observable from outside. */
export const DAEMON_HEARTBEAT_FILE = ".backup-daemon.json";

/**
 * The instance identity this box uploads under, used when `R2_INSTANCE` is not
 * set. Slice 147 refuses to upload from a runtime that identifies as
 * dev/test/`VITEST` unless the operator says which namespace to use — correct
 * for tests, but it would silently disable the real off-box copy here, where the
 * only listener is `vite dev`. So the daemon sets the identity EXPLICITLY rather
 * than inheriting an inference from whatever started it.
 */
export const DEFAULT_DAEMON_INSTANCE = "host-primary";

/** The CLI's exit code when a run was refused because another one is in flight. */
export const EXIT_REFUSED = 3;

export interface LockHolder {
  pid: number;
  at: string;
  reason: string;
  host: string;
}

export interface AcquiredLock {
  ok: true;
  path: string;
  /** The dead holder whose lock we replaced, or null when we created it. */
  tookOver: LockHolder | null;
  release: () => void;
}

export interface RefusedLock {
  ok: false;
  path: string;
  holder: LockHolder | null;
  reason: string;
}

export type LockResult = AcquiredLock | RefusedLock;

/** True when the pid names a live process we could signal. EPERM counts as alive. */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    // A process owned by another user answers EPERM: it exists, we just cannot
    // signal it. Treating that as "dead" would let us steal a live lock.
    return e?.code === "EPERM";
  }
}

function parseHolder(raw: string): LockHolder | null {
  try {
    const v = JSON.parse(raw);
    const pid = Number(v?.pid);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return {
      pid,
      at: typeof v?.at === "string" ? v.at : "",
      reason: typeof v?.reason === "string" ? v.reason : "",
      host: typeof v?.host === "string" ? v.host : "",
    };
  } catch {
    return null;
  }
}

/** Read a lock file without creating anything. Never throws. */
export function readLockHolder(path: string): LockHolder | null {
  try {
    if (!existsSync(path)) return null;
    return parseHolder(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Take an exclusive lock file. `wx` is the atomic primitive: exactly one creator
 * wins, everyone else sees EEXIST.
 *
 * A lock whose holder is DEAD is taken over rather than left to block every
 * future run forever — a machine that reboots mid-run must not need a human to
 * delete a file before backups resume. The takeover is reported, never silent.
 */
export function acquireLock(opts: {
  path: string;
  reason?: string;
  now?: () => Date;
  pid?: number;
  alive?: (pid: number) => boolean;
}): LockResult {
  const pid = opts.pid ?? process.pid;
  const alive = opts.alive ?? isProcessAlive;
  const body = JSON.stringify(
    {
      pid,
      at: (opts.now ?? (() => new Date()))().toISOString(),
      reason: opts.reason ?? "",
      host: hostname(),
    },
    null,
    2,
  );

  const create = (): boolean => {
    let fd: number | null = null;
    try {
      fd = openSync(opts.path, "wx", 0o600);
      writeSync(fd, body);
      return true;
    } catch (e: any) {
      if (e?.code === "EEXIST") return false;
      // An unwritable archive root is a real error the caller must see, but this
      // module never throws: an unreadable path means "not acquired".
      return false;
    } finally {
      if (fd !== null) {
        try {
          closeSync(fd);
        } catch {
          /* nothing useful to do */
        }
      }
    }
  };

  if (create()) {
    return { ok: true, path: opts.path, tookOver: null, release: () => releaseLock(opts.path, pid) };
  }

  const holder = readLockHolder(opts.path);
  const holderAlive = holder ? alive(holder.pid) : false;
  if (holder && holderAlive) {
    return {
      ok: false,
      path: opts.path,
      holder,
      reason: `held by pid ${holder.pid}${holder.reason ? ` (${holder.reason})` : ""} since ${holder.at || "unknown"}`,
    };
  }

  // Stale: the holder is gone, or the file is unreadable garbage. Replace it.
  const tookOver = holder;
  try {
    unlinkSync(opts.path);
  } catch {
    /* someone else may have removed it first — the create below decides */
  }
  if (create()) {
    return { ok: true, path: opts.path, tookOver, release: () => releaseLock(opts.path, pid) };
  }
  return {
    ok: false,
    path: opts.path,
    holder: readLockHolder(opts.path),
    reason: "could not acquire after clearing a stale lock",
  };
}

/**
 * Release a lock, but only if it is still OURS. Without this check a process
 * that lost a takeover race could delete the winner's lock and let a third
 * process in.
 */
export function releaseLock(path: string, pid: number = process.pid): void {
  try {
    const holder = readLockHolder(path);
    if (holder && holder.pid !== pid) return;
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* a lock we cannot remove is reported by the next acquire, not here */
  }
}

// ── Daemon heartbeat ────────────────────────────────────────────────────────

export interface DaemonHeartbeat {
  pid: number;
  state: "running" | "stopped";
  startedAt: string;
  updatedAt: string;
  intervalMs: number;
  firstDelayMs: number;
  /** Runs started by this loop since it began. */
  ticks: number;
  lastRunStartedAt: string | null;
  lastRunEndedAt: string | null;
  /** 0 = success, EXIT_REFUSED = another run held the lock, other = failure. */
  lastExitCode: number | null;
  nextRunAt: string | null;
  /** What the loop can see of the off-box configuration — booleans, never values. */
  env: {
    r2Configured: boolean;
    missing: string[];
    passphraseSet: boolean;
    instance: string | null;
    instanceSource: string | null;
    prefix: string | null;
    uploadAllowed: boolean;
    uploadSkipReason: string | null;
  } | null;
}

export function heartbeatPath(outDir: string): string {
  return join(outDir, DAEMON_HEARTBEAT_FILE);
}

export function daemonLockPath(outDir: string): string {
  return join(outDir, DAEMON_LOCK_FILE);
}

export function runLockPath(outDir: string): string {
  return join(outDir, RUN_LOCK_FILE);
}

/** Read the heartbeat without creating anything. Never throws. */
export function readDaemonHeartbeat(outDir: string): DaemonHeartbeat | null {
  try {
    const file = heartbeatPath(outDir);
    if (!existsSync(file)) return null;
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    const pid = Number(raw.pid);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return {
      pid,
      state: raw.state === "stopped" ? "stopped" : "running",
      startedAt: typeof raw.startedAt === "string" ? raw.startedAt : "",
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
      intervalMs: Number(raw.intervalMs) || 0,
      firstDelayMs: Number(raw.firstDelayMs) || 0,
      ticks: Number(raw.ticks) || 0,
      lastRunStartedAt: typeof raw.lastRunStartedAt === "string" ? raw.lastRunStartedAt : null,
      lastRunEndedAt: typeof raw.lastRunEndedAt === "string" ? raw.lastRunEndedAt : null,
      lastExitCode: Number.isInteger(raw.lastExitCode) ? raw.lastExitCode : null,
      nextRunAt: typeof raw.nextRunAt === "string" ? raw.nextRunAt : null,
      env: raw.env && typeof raw.env === "object" ? raw.env : null,
    };
  } catch {
    return null;
  }
}

/** Persist the heartbeat atomically (a torn heartbeat must not read as alive). */
export function writeDaemonHeartbeat(outDir: string, hb: DaemonHeartbeat): void {
  try {
    atomicWriteSync(heartbeatPath(outDir), JSON.stringify(hb, null, 2));
  } catch {
    /* the loop keeps running; the next tick rewrites it */
  }
}

export interface DaemonStatus {
  /** A loop holds the lock, its pid is alive AND its heartbeat is fresh. */
  alive: boolean;
  pid: number | null;
  heartbeat: DaemonHeartbeat | null;
  heartbeatAgeMs: number | null;
  /** Why the answer is what it is. Always populated. */
  reason: string;
}

/**
 * Is a supervising loop running for this archive root?
 *
 * Deliberately conservative: ALL THREE of lock, live pid and a heartbeat within
 * `staleAfterMs` must hold. A crash, a `kill -9` or a machine reboot therefore
 * reads as "not alive" — the server falls back to its own scheduler and the
 * freshness surface reports the gap. The opposite error (claiming a dead loop is
 * alive) would silently switch backups off, which is the bug this slice fixes.
 */
export function daemonStatus(opts: {
  outDir: string;
  intervalMs?: number;
  now?: Date;
  alive?: (pid: number) => boolean;
  /** Default: 2.5x the interval, floored at 5 minutes. */
  staleAfterMs?: number;
}): DaemonStatus {
  const alive = opts.alive ?? isProcessAlive;
  const intervalMs = opts.intervalMs && opts.intervalMs > 0 ? opts.intervalMs : 60 * 60 * 1000;
  const staleAfterMs = opts.staleAfterMs ?? Math.max(5 * 60 * 1000, intervalMs * 2.5);
  const nowMs = (opts.now ?? new Date()).getTime();

  const lockPath = daemonLockPath(opts.outDir);
  if (!existsSync(lockPath)) {
    return { alive: false, pid: null, heartbeat: null, heartbeatAgeMs: null, reason: "no daemon lock" };
  }
  const holder = readLockHolder(lockPath);
  if (!holder) {
    return { alive: false, pid: null, heartbeat: null, heartbeatAgeMs: null, reason: "daemon lock is unreadable" };
  }
  if (!alive(holder.pid)) {
    return { alive: false, pid: holder.pid, heartbeat: readDaemonHeartbeat(opts.outDir), heartbeatAgeMs: null, reason: `daemon pid ${holder.pid} is not running` };
  }
  const heartbeat = readDaemonHeartbeat(opts.outDir);
  if (!heartbeat) {
    return { alive: false, pid: holder.pid, heartbeat: null, heartbeatAgeMs: null, reason: `daemon pid ${holder.pid} has no heartbeat` };
  }
  if (heartbeat.pid !== holder.pid) {
    return { alive: false, pid: holder.pid, heartbeat, heartbeatAgeMs: null, reason: `heartbeat belongs to pid ${heartbeat.pid}, lock to pid ${holder.pid}` };
  }
  const updatedMs = Date.parse(heartbeat.updatedAt);
  const ageMs = Number.isFinite(updatedMs) ? Math.max(0, nowMs - updatedMs) : null;
  if (ageMs === null || ageMs > staleAfterMs) {
    return { alive: false, pid: holder.pid, heartbeat, heartbeatAgeMs: ageMs, reason: `heartbeat is stale (${ageMs === null ? "unparseable" : `${Math.round(ageMs / 1000)}s`} old, limit ${Math.round(staleAfterMs / 1000)}s)` };
  }
  return { alive: true, pid: holder.pid, heartbeat, heartbeatAgeMs: ageMs, reason: `daemon pid ${holder.pid} running, heartbeat ${Math.round(ageMs / 1000)}s old` };
}

/**
 * When should the next run start?
 *
 * Fixed-rate from the moment the PREVIOUS run started, not a sleep after it
 * finished: a slow run must not push the schedule later every hour. A run that
 * overruns the interval yields 0 (start now) — still safe, because the run lock
 * serialises runs, so the worst case is back-to-back runs, never two at once.
 */
export function nextRunDelayMs(opts: {
  nowMs: number;
  ticks: number;
  lastRunStartedAtMs: number | null;
  intervalMs: number;
  firstDelayMs: number;
}): number {
  const intervalMs = opts.intervalMs > 0 ? opts.intervalMs : 60 * 60 * 1000;
  if (opts.ticks === 0 || opts.lastRunStartedAtMs === null) {
    return Math.max(0, opts.firstDelayMs);
  }
  return Math.max(0, opts.lastRunStartedAtMs + intervalMs - opts.nowMs);
}
