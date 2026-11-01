/**
 * backup-dir.ts — SLICE 165. WHERE a backup run writes, derived from the data
 * directory instead of from this developer's machine.
 *
 * THE BUG THIS FILE EXISTS FOR. `prod-server.ts` read its archive root as:
 *
 *     process.env.BACKUP_DIR?.trim() || "/home/team/shared/backups"
 *
 * That literal is THIS dev box's directory. On the published deployment it does
 * not exist and cannot exist, so every scheduled run and every press of "Run a
 * backup now" tried to create a lock inside a directory that was not there,
 * failed with ENOENT, and was reported as "another backup run holds the lock".
 * The live page printed `/home/team/shared/backups` as its own local destination
 * — a path from a different machine — and the deployment never produced a single
 * archive of its own.
 *
 * THE RULE. An explicit `BACKUP_DIR` still wins (an operator saying where to
 * write is not a default). With no override the root is a SIBLING of the data
 * directory: `<dirname(DATA_DIR)>/backups`. That keeps it
 *
 *   - outside DATA_DIR (the archive is not a copy of itself — `runBackup` refuses
 *     an outDir inside the data dir, and this derivation can never produce one),
 *   - outside the publish tree (it follows DATA_DIR, which the data-dir policy
 *     already places outside that tree),
 *   - and identical on this dev box to the path it used to hardcode
 *     (`/home/team/shared/.data` → `/home/team/shared/backups`), so nothing about
 *     the existing machine's behaviour changes.
 *
 * Pure: no I/O, no clock, no environment mutation. It never creates anything —
 * `ensureArchiveRoot` in scripts/lib/backup-daemon.ts does that, before the lock.
 */
import { dirname, isAbsolute, resolve } from "node:path";

export const BACKUP_DIR_ENV = "BACKUP_DIR";

export interface ArchiveBackupDir {
  /** Absolute path to the archive root. */
  dir: string;
  /** `env` = the operator named it; `derived` = a sibling of DATA_DIR. */
  source: "env" | "derived";
  /** Plain words, safe to show the owner. */
  reason: string;
}

/**
 * The archive root for this deployment. Never returns a path inside `dataDir`.
 */
export function resolveArchiveBackupDir(opts: {
  env: Record<string, string | undefined>;
  dataDir: string;
}): ArchiveBackupDir {
  const dataDir = resolve(opts.dataDir);
  const explicit = (opts.env[BACKUP_DIR_ENV] || "").trim();
  if (explicit) {
    const dir = isAbsolute(explicit) ? explicit : resolve(explicit);
    return {
      dir,
      source: "env",
      reason: `${BACKUP_DIR_ENV} is set, so archives are written exactly there (${dir}).`,
    };
  }
  // A sibling of the data directory. `dirname("/")` is "/", so a data dir at the
  // filesystem root still yields a real path ("/backups") rather than "".
  const parent = dirname(dataDir);
  const dir = resolve(parent, "backups");
  return {
    dir,
    source: "derived",
    reason: `No ${BACKUP_DIR_ENV} is set, so archives are written beside the data directory: ${dir} (DATA_DIR is ${dataDir}). It is outside the data directory and outside the publish tree by construction.`,
  };
}

/** True when `outDir` is the data directory or inside it. */
export function isInsideDataDir(outDir: string, dataDir: string): boolean {
  const o = resolve(outDir);
  const d = resolve(dataDir);
  return o === d || o.startsWith(d.endsWith("/") ? d : d + "/");
}
