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
      lastBackupR2: r2Record(raw.r2),
    };
  } catch {
    return { ...EMPTY };
  }
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
