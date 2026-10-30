/**
 * backup-scheduler.ts — SLICE 144. Backups that happen without a human.
 *
 * WHY THIS EXISTS (owner directive 2026-10-30: "All clients need their data
 * secured."): slice 143 built a correct, verified, coverage-checked archive —
 * and NOTHING RAN IT. `scripts/backup.mjs` only produced a copy when someone
 * typed the command, so in practice the business had no recent copy at all.
 *
 * WHAT IT DOES: calls a supplied `run()` on a timer (hourly by default, first
 * run shortly after boot). The caller passes `runBackup()` from
 * scripts/lib/backup-core.ts, so the server and the CLI share ONE pipeline —
 * this module only owns the cadence and the failure discipline.
 *
 * FAILURE DISCIPLINE (each rule is a way a scheduler takes down a server):
 *   - a failed run NEVER throws out of the timer: it is caught, logged ONCE,
 *     counted, and reported back to the caller (which writes backup_status.json
 *     so `/api/admin/datadir` shows lastBackupError);
 *   - two runs never overlap: a second invocation while one is in flight is
 *     REFUSED and counted, not queued and not run in parallel;
 *   - the timer never keeps the process alive (unref) and is stopped on demand;
 *   - DISABLED UNDER TEST. The canonical suite spawns real prod servers; a
 *     scheduler that fired there would write archives during every test run.
 *     `BACKUP_DISABLED=1` or a test runtime disables it outright, and the reason
 *     is reported rather than silently ignored.
 */
import { failedStatus, writeBackupStatus } from "../../scripts/lib/backup-core";
import { backupEventLine, staleEventLine, type BackupFreshness } from "./backup-status";

export interface BackupRunOutcome {
  ok: boolean;
  error?: string;
  skipped?: boolean;
  runId?: string;
  files?: number;
  bytes?: number;
  /** SLICE 145: the off-box leg of this run, so the log line tells the truth. */
  r2?: { uploaded: boolean; key: string | null; error: string | null; uploadSkipped: string | null } | null;
}

export interface BackupSchedulerTimers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface BackupSchedulerOptions {
  /** The pipeline. In the server this is `() => runBackup({...})`. */
  run: () => Promise<BackupRunOutcome>;
  intervalMs: number;
  /** First run this long after boot. */
  firstDelayMs?: number;
  /** Force-disable (tests / explicit opt-out). */
  disabled?: boolean;
  disabledReason?: string;
  /** Called with the message of any failure so the caller can persist it. */
  recordFailure?: (message: string) => void;
  /**
   * SLICE 147 — read the CURRENT freshness from the durable status file. Called
   * after every attempt so a stale or failing deployment produces a structured,
   * greppable line instead of a quietly ageing timestamp. Optional: without it
   * the scheduler behaves exactly as it did in slice 144.
   */
  freshness?: () => BackupFreshness;
  log?: (message: string) => void;
  timers?: BackupSchedulerTimers;
  now?: () => number;
}

export interface BackupSchedulerStatus {
  disabled: boolean;
  disabledReason: string;
  intervalMs: number;
  firstDelayMs: number;
  started: boolean;
  running: boolean;
  /** Successful runs since boot. */
  runs: number;
  /** Failed runs since boot. */
  failures: number;
  /** Invocations refused because another run was in flight. */
  refused: number;
  lastAttemptAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
}

export interface BackupSchedulerHandle {
  /** Run once now. Refused (never queued) while another run is in flight. */
  trigger: (reason?: string) => Promise<BackupRunOutcome>;
  stop: () => void;
  status: () => BackupSchedulerStatus;
}

const DEFAULT_TIMERS: BackupSchedulerTimers = {
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    (handle as any)?.unref?.();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as any),
};

/** True when the scheduler must not start, and why. Never guesses. */
export function backupSchedulerDisabled(
  env: Record<string, string | undefined> = process.env,
): { disabled: boolean; reason: string } {
  if (env.BACKUP_DISABLED === "1") return { disabled: true, reason: "BACKUP_DISABLED=1" };
  if (env.NODE_ENV === "test" || env.VITEST) {
    return { disabled: true, reason: "test runtime — the suite must never write archives" };
  }
  return { disabled: false, reason: "" };
}

/** Resolve the cadence from the environment (invalid → hourly default). */
export function resolveBackupInterval(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.BACKUP_INTERVAL_MS);
  return Number.isFinite(n) && n > 0 ? n : 60 * 60 * 1000;
}

export function startBackupScheduler(opts: BackupSchedulerOptions): BackupSchedulerHandle {
  const timers = opts.timers ?? DEFAULT_TIMERS;
  const now = opts.now ?? (() => Date.now());
  const log = opts.log ?? ((m: string) => console.log(m));
  const intervalMs = opts.intervalMs;
  const firstDelayMs = opts.firstDelayMs ?? 60_000;

  const status: BackupSchedulerStatus = {
    disabled: !!opts.disabled,
    disabledReason: opts.disabledReason ?? "",
    intervalMs,
    firstDelayMs,
    started: false,
    running: false,
    runs: 0,
    failures: 0,
    refused: 0,
    lastAttemptAt: null,
    lastOkAt: null,
    lastError: null,
  };

  let stopped = false;
  let timer: unknown = null;

  const iso = () => new Date(now()).toISOString();

  /**
   * SLICE 147 — after every attempt, ask the durable status how things actually
   * stand and emit ONE structured line when it is bad. Never throws: a broken
   * status read must not break the scheduler it is reporting on.
   */
  function reportFreshness(reason: string): void {
    if (!opts.freshness) return;
    let fresh: BackupFreshness;
    try {
      fresh = opts.freshness();
    } catch (e: any) {
      log(backupEventLine("freshness-unreadable", { trigger: reason, error: e?.message || String(e) }));
      return;
    }
    const stale = staleEventLine(fresh);
    if (stale) log(stale);
  }

  async function trigger(reason = "manual"): Promise<BackupRunOutcome> {
    if (status.running) {
      status.refused += 1;
      log(`[backup] refused a concurrent run (${reason}): one is already in flight`);
      return { ok: false, skipped: true, error: "backup already running — concurrent invocation refused" };
    }
    status.running = true;
    status.lastAttemptAt = iso();
    try {
      const outcome = await opts.run();
      if (outcome?.ok) {
        status.runs += 1;
        status.lastOkAt = iso();
        const off = outcome.r2
          ? outcome.r2.uploaded
            ? `, off-box ${outcome.r2.key}`
            : outcome.r2.error
              ? `, OFF-BOX FAILED: ${outcome.r2.error}`
              : `, off-box skipped: ${outcome.r2.uploadSkipped}`
          : "";
        log(
          `[backup] ok (${reason}): run ${outcome.runId ?? "?"} ${outcome.files ?? 0} files, ${outcome.bytes ?? 0} bytes${off}`,
        );
        // An upload failure is NOT a failed local run (the archive is intact and
        // the server keeps serving). It is already reported with its own
        // structured `[backup][upload-failed]` line by scripts/lib/r2-backup.ts
        // (which knows the object key and the durable counter), so this only
        // carries it into the human-readable summary — no duplicate event line.
      } else {
        status.failures += 1;
        status.lastError = outcome?.error || "backup run reported ok=false";
        log(`[backup] FAILED (${reason}): ${status.lastError}`);
        log(
          backupEventLine("run-failed", {
            trigger: reason,
            error: status.lastError,
            consecutiveFailures: readConsecutiveFailures(),
            failuresSinceBoot: status.failures,
          }),
        );
      }
      reportFreshness(reason);
      return outcome ?? { ok: false, error: "backup run returned nothing" };
    } catch (e: any) {
      // A scheduler that crashes the server is worse than no scheduler.
      const message = e?.message || String(e);
      status.failures += 1;
      status.lastError = message;
      log(`[backup] FAILED (${reason}): ${message}`);
      log(
        backupEventLine("run-failed", {
          trigger: reason,
          error: message,
          consecutiveFailures: readConsecutiveFailures(),
          failuresSinceBoot: status.failures,
        }),
      );
      try {
        opts.recordFailure?.(message);
      } catch (recordErr: any) {
        log(`[backup] could not record the failure: ${recordErr?.message || recordErr}`);
      }
      reportFreshness(reason);
      return { ok: false, error: message };
    } finally {
      status.running = false;
    }
  }

  /** The durable counters, read through the injected reader. Never throws. */
  function readFreshnessCounters(): { runFailures: number | null; uploadFailures: number | null } {
    if (!opts.freshness) return { runFailures: null, uploadFailures: null };
    try {
      const f = opts.freshness();
      return { runFailures: f.consecutiveFailures, uploadFailures: f.consecutiveUploadFailures };
    } catch {
      return { runFailures: null, uploadFailures: null };
    }
  }

  /** Convenience for the run-failure lines. */
  function readConsecutiveFailures(): number | null {
    return readFreshnessCounters().runFailures;
  }

  function scheduleNext(delayMs: number): void {
    if (stopped || status.disabled) return;
    timer = timers.setTimeout(() => {
      timer = null;
      if (stopped) return;
      void trigger("scheduled").then(() => scheduleNext(intervalMs));
    }, delayMs);
  }

  if (status.disabled) {
    log(`[backup] scheduler DISABLED: ${status.disabledReason || "disabled"}`);
  } else {
    status.started = true;
    scheduleNext(firstDelayMs);
    log(`[backup] scheduler started: every ${intervalMs}ms, first run in ${firstDelayMs}ms`);
  }

  return {
    trigger,
    stop: () => {
      stopped = true;
      if (timer !== null) {
        timers.clearTimeout(timer);
        timer = null;
      }
    },
    status: () => ({ ...status }),
  };
}

/**
 * Server-side failure recorder: a failed run must be visible on
 * `/api/admin/datadir`, which reads `backup_status.json`. Never throws.
 */
export function backupFailureRecorder(dataDir: string, target: string): (message: string) => void {
  return (message: string) => {
    try {
      writeBackupStatus(dataDir, failedStatus(new Date().toISOString(), target, message));
    } catch {
      /* the admin surface will keep reporting the previous status — never crash */
    }
  };
}
