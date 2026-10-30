/**
 * backup-status.ts — SLICE 143. The honest surface for the same-host archive.
 *
 * `scripts/backup.mjs` writes `backup_status.json` into DATA_DIR after every
 * run (success or failure). The existing owner-only admin endpoint
 * `/api/admin/datadir` reads it here, so the operator can see when the last
 * archive ran, whether it succeeded, and where it went — without a new page and
 * without a claim the product cannot back up.
 *
 * WHAT THIS IS NOT: an off-box copy, disaster recovery, or a guarantee. The
 * archive lives on the same host and the same disk as the data it protects. The
 * field names below say "lastBackup*" because that is what the file is; no
 * customer-facing copy anywhere may use the word.
 *
 * Fail-open by design: a missing or malformed status file must never break the
 * admin diagnostic — it reports `lastBackupAt: null` and nothing else. It never
 * throws and it never returns a value it did not read from disk.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { readJSON } from "./data-store";
import type { R2Record } from "../../scripts/lib/backup-core";

export const BACKUP_STATUS_FILE = "backup_status.json";

export interface BackupStatusSummary {
  lastBackupAt: string | null;
  lastBackupOk: boolean | null;
  lastBackupBytes: number | null;
  lastBackupTarget: string | null;
  lastBackupError: string | null;
  lastBackupRunId: string | null;
  lastBackupFiles: number | null;
  lastBackupEncryption: string | null;
  /** SLICE 147 — when a run last SUCCEEDED (null = never observed). */
  lastBackupOkAt: string | null;
  /** SLICE 147 — consecutive failed runs; 0 after a success. */
  consecutiveFailures: number | null;
  /** SLICE 147 — consecutive failed off-box uploads; 0 after a successful one. */
  consecutiveUploadFailures: number | null;
  /**
   * SLICE 145 — the off-box leg, exactly as the run recorded it. `null` means
   * this status file predates slice 145 or the run never got that far; it never
   * means "uploaded". A missing object key, a redacted error and a skip reason
   * are all reported verbatim so the operator can tell the three apart.
   */
  lastBackupR2: R2Record | null;
}

const EMPTY: BackupStatusSummary = {
  lastBackupAt: null,
  lastBackupOk: null,
  lastBackupBytes: null,
  lastBackupTarget: null,
  lastBackupError: null,
  lastBackupRunId: null,
  lastBackupFiles: null,
  lastBackupEncryption: null,
  lastBackupOkAt: null,
  consecutiveFailures: null,
  consecutiveUploadFailures: null,
  lastBackupR2: null,
};

function str(v: any): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: any): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * The r2 record, re-built field by field. A hand-edited or half-written status
 * file yields nulls rather than a made-up success — the same rule the rest of
 * this module follows.
 */
function r2Record(v: any): R2Record | null {
  if (!v || typeof v !== "object") return null;
  return {
    configured: v.configured === true,
    uploaded: v.uploaded === true,
    key: str(v.key),
    bytes: num(v.bytes),
    etag: str(v.etag),
    uploadedAt: str(v.uploadedAt),
    error: str(v.error),
    uploadSkipped: str(v.uploadSkipped),
    pruned: Array.isArray(v.pruned) ? v.pruned.filter((k: any) => typeof k === "string") : [],
    pruneError: str(v.pruneError),
  };
}

/** Read the last backup status for a data dir. Never throws, never guesses. */
export function readBackupStatus(dataDir: string): BackupStatusSummary {
  const file = join(dataDir, BACKUP_STATUS_FILE);
  try {
    if (!existsSync(file)) return { ...EMPTY };
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    if (!raw || typeof raw !== "object") return { ...EMPTY };
    return {
      lastBackupAt: str(raw.lastBackupAt),
      lastBackupOk: typeof raw.lastBackupOk === "boolean" ? raw.lastBackupOk : null,
      lastBackupBytes: num(raw.lastBackupBytes),
      lastBackupTarget: str(raw.lastBackupTarget),
      lastBackupError: str(raw.lastBackupError),
      lastBackupRunId: str(raw.runId),
      lastBackupFiles: num(raw.files),
      lastBackupEncryption: str(raw.encryption),
      lastBackupOkAt: str(raw.lastBackupOkAt),
      consecutiveFailures: num(raw.consecutiveFailures),
      consecutiveUploadFailures: num(raw.consecutiveUploadFailures),
      lastBackupR2: r2Record(raw.r2),
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * SLICE 147 — IS THE BACKUP ACTUALLY RUNNING?
 *
 * Before this, a scheduler that silently stopped looked identical to a healthy
 * one: `lastBackupAt` simply got older and nothing complained. The owner's
 * directive is "I don't want any data loss", and a backup system whose failure
 * mode is silence does not meet it.
 *
 * THE RULE, in one line: freshness is measured from the last run that actually
 * SUCCEEDED, and a deployment that has never had one is never called healthy.
 *
 * The threshold is a small multiple of the schedule, not a magic number: with an
 * hourly schedule and a factor of 2.5, one missed run is tolerated (a slow run, a
 * restart) and two consecutive misses are loud. `BACKUP_STALE_FACTOR` can change
 * it; nothing else about it is arbitrary.
 *
 * Computed on READ (the admin endpoint), so it is still correct when the thing
 * that died is the scheduler itself — the surface does not depend on the process
 * that stopped.
 */
export const DEFAULT_BACKUP_INTERVAL_MS = 60 * 60 * 1000;
export const DEFAULT_STALE_FACTOR = 2.5;
export const BACKUP_STALE_FACTOR_ENV = "BACKUP_STALE_FACTOR";

export type BackupFreshnessReason = "ok" | "never-ran" | "overdue" | "last-run-failed" | "scheduler-disabled";

export interface BackupFreshness {
  /** True whenever we cannot show a recent successful run. */
  stale: boolean;
  /** True ONLY for a real, observed, recent success. Never inferred. */
  healthy: boolean;
  reason: BackupFreshnessReason;
  /** Age of the last SUCCESSFUL run in ms, or null when there has never been one. */
  ageMs: number | null;
  ageSeconds: number | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastAttemptOk: boolean | null;
  intervalMs: number;
  staleFactor: number;
  thresholdMs: number;
  consecutiveFailures: number | null;
  consecutiveUploadFailures: number | null;
  lastError: string | null;
  schedulerDisabled: boolean;
  schedulerDisabledReason: string;
  /** The off-box leg of the last attempt, verbatim. */
  offBox: { uploaded: boolean; at: string | null; key: string | null; error: string | null; skipped: string | null } | null;
  checkedAt: string;
}

export interface FreshnessOptions {
  now?: Date;
  intervalMs?: number;
  staleFactor?: number;
  schedulerDisabled?: boolean;
  schedulerDisabledReason?: string;
}

/** `BACKUP_STALE_FACTOR`, or the default. A nonsense value falls back, never throws. */
export function resolveStaleFactor(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env[BACKUP_STALE_FACTOR_ENV]);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_STALE_FACTOR;
}

/**
 * The one place staleness is decided. Pure: same status + same clock ⇒ same
 * answer, which is what makes it testable and what stops the endpoint from
 * inventing a success.
 */
export function backupFreshness(status: BackupStatusSummary, opts: FreshnessOptions = {}): BackupFreshness {
  const now = opts.now ?? new Date();
  const intervalMs = opts.intervalMs && opts.intervalMs > 0 ? opts.intervalMs : DEFAULT_BACKUP_INTERVAL_MS;
  const staleFactor = opts.staleFactor && opts.staleFactor >= 1 ? opts.staleFactor : DEFAULT_STALE_FACTOR;
  const thresholdMs = Math.round(intervalMs * staleFactor);

  // A status file written before slice 147 has no `lastBackupOkAt`; if it says
  // the last run was OK, that run WAS the last success. Anything else is unknown.
  const lastSuccessAt = status.lastBackupOkAt ?? (status.lastBackupOk === true ? status.lastBackupAt : null);
  const successMs = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  const ageMs = Number.isFinite(successMs) ? Math.max(0, now.getTime() - successMs) : null;
  const healthy = ageMs !== null && ageMs <= thresholdMs;

  let reason: BackupFreshnessReason;
  if (healthy) reason = opts.schedulerDisabled ? "scheduler-disabled" : "ok";
  else if (opts.schedulerDisabled) reason = "scheduler-disabled";
  else if (ageMs === null) reason = "never-ran";
  else if (status.lastBackupOk === false) reason = "last-run-failed";
  else reason = "overdue";

  const r2 = status.lastBackupR2;
  return {
    stale: !healthy,
    healthy,
    reason,
    ageMs,
    ageSeconds: ageMs === null ? null : Math.round(ageMs / 1000),
    lastSuccessAt,
    lastAttemptAt: status.lastBackupAt,
    lastAttemptOk: status.lastBackupOk,
    intervalMs,
    staleFactor,
    thresholdMs,
    consecutiveFailures: status.consecutiveFailures,
    consecutiveUploadFailures: status.consecutiveUploadFailures,
    lastError: status.lastBackupError,
    schedulerDisabled: !!opts.schedulerDisabled,
    schedulerDisabledReason: opts.schedulerDisabledReason ?? "",
    offBox: r2
      ? { uploaded: r2.uploaded, at: r2.uploadedAt, key: r2.key, error: r2.error, skipped: r2.uploadSkipped }
      : null,
    checkedAt: now.toISOString(),
  };
}

/** Convenience: read the status file and decide freshness in one step. */
export function readBackupFreshness(dataDir: string, opts: FreshnessOptions = {}): BackupFreshness {
  return backupFreshness(readBackupStatus(dataDir), opts);
}

/**
 * One greppable, structured line per backup event. `grep '\[backup\]\['` finds
 * every failure the system has ever reported, and each line is valid JSON after
 * the prefix so a log pipeline can read it without a regex.
 */
export function backupEventLine(event: string, fields: Record<string, unknown>): string {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) safe[k] = v === undefined ? null : v;
  return `[backup][${event}] ${JSON.stringify(safe)}`;
}

/** The staleness line, or null when there is nothing to complain about. */
export function staleEventLine(freshness: BackupFreshness): string | null {
  if (!freshness.stale) return null;
  return backupEventLine(freshness.reason === "overdue" ? "overdue" : "stale", {
    reason: freshness.reason,
    lastSuccessAt: freshness.lastSuccessAt,
    ageSeconds: freshness.ageSeconds,
    intervalMs: freshness.intervalMs,
    thresholdMs: freshness.thresholdMs,
    consecutiveFailures: freshness.consecutiveFailures,
    consecutiveUploadFailures: freshness.consecutiveUploadFailures,
    lastError: freshness.lastError,
    offBox: freshness.offBox,
    checkedAt: freshness.checkedAt,
  });
}

/**
 * Known stores whose entry COUNTS are safe to report to the owner.
 * Counts only — never a key, an email, a token or a document body.
 */
export const COUNTED_STORES: readonly string[] = [
  "users.json",
  "sessions.json",
  "tenant_purchases.json",
  "tenant_subscriptions.json",
  "tenant_approvals.json",
  "tenant_audit_logs.json",
  "tenant_oauth_credentials.json",
  "vault_index.json",
  "vault_folders.json",
  "vault_audit.json",
  "leads.json",
  "sales_events.json",
];

export interface StoreCount {
  file: string;
  present: boolean;
  entries: number;
}

/**
 * Entry count per known store, read through the app's own read path
 * (`readJSON`), so the number is what the running server would actually see.
 */
export function countStoreEntries(dataDir: string): StoreCount[] {
  return COUNTED_STORES.map((file) => {
    const present = existsSync(join(dataDir, file));
    if (!present) return { file, present: false, entries: 0 };
    let entries = 0;
    try {
      const data = readJSON(join(dataDir, file));
      if (Array.isArray(data)) entries = data.length;
      else if (data && typeof data === "object") entries = Object.keys(data).length;
    } catch {
      entries = 0;
    }
    return { file, present: true, entries };
  });
}
