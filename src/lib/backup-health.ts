/**
 * backup-health.ts — SLICE 163. Is this deployment's data actually OFF this disk?
 *
 * THE QUESTION THIS FILE ANSWERS. Slice 162 made a deployment prove its data
 * survived a publish. It said nothing about surviving a DISK. The plan promises
 * clients that their data is backed up hourly, encrypted, off this machine, and
 * on 2026-11-01 that was true for exactly one data directory in the world: the
 * dev box's `/home/team/shared/.data`. The published site runs on a filesystem
 * nothing here can read, and the bucket held seven objects, none of them
 * recognisably the live site's.
 *
 * So the same rule slice 162 used for publish survival is applied to the off-box
 * copy: the deployment states its own facts, read from its own filesystem at
 * request time, and a backup that has never run reads RED — never "fine".
 *
 * WHERE THE FACTS COME FROM (all read on every request, none cached):
 *   - `<DATA_DIR>/backup_status.json` — the durable status every run rewrites:
 *     last attempt, last SUCCESS, consecutive failures, and the off-box record
 *     (uploaded / key / error / skip reason).
 *   - `<BACKUP_DIR>/<newest run>/manifest.json` — the coverage table that run
 *     wrote, so "declared vs present vs archived" compares two real things.
 *   - the environment — which R2 values are present (names only, never values)
 *     and which namespace this deployment uploads under.
 *   - the scheduler's own status, when the caller has one.
 *
 * HONESTY RULES (each is a test in src/test/backup-health-163.test.ts):
 *   - no status file            → verdict "never", never "green";
 *   - attempted but never OK    → verdict "never" and the error is quoted;
 *   - last success older than 2.5 × the interval → "red", with the age;
 *   - an upload that has never succeeded → "red": the archive exists, but it is
 *     still on the disk it is meant to survive;
 *   - a manifest that predates a declared store → "red": that store is not in
 *     the archive even though the coverage table looks complete.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { DURABLE_STORES, isDirectoryStore } from "./durable-stores";
import { isInsidePublishTree } from "./data-dir-policy";
import { readBackupStatus, refusalFromRaw } from "./backup-status";
import type { BackupRefusalRecord } from "./backup-status";
import { describeR2Config } from "./r2-upload";
import type { DeploymentNamespace } from "./backup-namespace";

/** Freshness rule shared with the supervised loop: 2.5 × the interval. */
export const DEFAULT_STALE_FACTOR = 2.5;

export type BackupVerdict = "green" | "red" | "never" | "unknown";

export interface BackupCoverageReport {
  /** Stores declared in `durable-stores.ts` right now. */
  declared: number;
  /** Declared stores that exist on disk right now (file present, or directory). */
  presentOnDisk: number;
  /** Declared stores the newest run's coverage table says it archived. */
  archivedInLastRun: number | null;
  /** Stores that hold bytes and are NOT in the newest archive. */
  uncovered: string[];
  /** Declared stores added AFTER the newest manifest was written. */
  declaredSinceManifest: number;
  manifestPresent: boolean;
  manifestPath: string | null;
  runId: string | null;
  verdict: "green" | "red" | "unknown";
  reason: string;
}

export interface BackupHealthReport {
  ok: boolean;
  verdict: BackupVerdict;
  reasons: string[];
  dataDir: string;
  destination: {
    outDir: string;
    insidePublishTree: boolean;
    runCount: number;
    newestRunId: string | null;
    newestRunAt: string | null;
  };
  namespace: {
    prefix: string;
    instance: string | null;
    role: string;
    source: string;
    reason: string;
    configured: boolean;
    missing: string[];
    bucket: string | null;
    endpointHost: string | null;
    /** False when this runtime must not upload at all (test/development). */
    uploadAllowed: boolean;
    skipReason: string | null;
  };
  status: {
    path: string;
    present: boolean;
    lastRunAt: string | null;
    lastOkAt: string | null;
    ageSeconds: number | null;
    staleAfterMs: number;
    stale: boolean;
    staleReason: "never-ran" | "overdue" | null;
    consecutiveFailures: number;
    consecutiveUploadFailures: number;
    lastError: string | null;
    runId: string | null;
    files: number | null;
    encryption: string | null;
  };
  upload: {
    configured: boolean;
    uploaded: boolean | null;
    key: string | null;
    uploadedAt: string | null;
    bytes: number | null;
    error: string | null;
    skipped: string | null;
    lastUploadOkAt: string | null;
    ageSeconds: number | null;
    prunedCount: number;
    pruneError: string | null;
  };
  coverage: BackupCoverageReport;
  scheduler: {
    disabled: boolean;
    disabledReason: string;
    intervalMs: number;
    running: boolean;
    runs: number;
    failures: number;
    lastAttemptAt: string | null;
    lastOkAt: string | null;
    lastError: string | null;
  } | null;
  /**
   * SLICE 165 — the last run this deployment REFUSED, and why. A refusal is not
   * a failure (nothing was attempted), so it has no counter — but it is the one
   * thing that explains a deployment whose backups never start, and until this
   * slice it was the one thing never written down. Null once a real run runs.
   */
  refusal: BackupRefusalRecord | null;
  checkedAt: string;
}

/** The newest run directory that actually holds a manifest, or null. */
export function newestRunWithManifest(outDir: string): { runId: string; dir: string; manifestPath: string } | null {
  let names: string[] = [];
  try {
    names = readdirSync(outDir);
  } catch {
    return null;
  }
  const runs = names
    .filter((name) => {
      try {
        if (!statSync(join(outDir, name)).isDirectory()) return false;
      } catch {
        return false;
      }
      return existsSync(join(outDir, name, "manifest.json"));
    })
    .sort();
  const newest = runs[runs.length - 1];
  if (!newest) return null;
  return { runId: newest, dir: join(outDir, newest), manifestPath: join(outDir, newest, "manifest.json") };
}

function countRuns(outDir: string): number {
  try {
    return readdirSync(outDir).filter((name) => {
      try {
        return statSync(join(outDir, name)).isDirectory() && existsSync(join(outDir, name, "manifest.json"));
      } catch {
        return false;
      }
    }).length;
  } catch {
    return 0;
  }
}

/** Does this declared store exist on disk right now? (stat only — no walk) */
function storePresent(dataDir: string, store: string): boolean {
  try {
    const st = statSync(join(dataDir, store));
    return isDirectoryStore(store) ? st.isDirectory() : st.isFile();
  } catch {
    return false;
  }
}

interface ManifestCoverageRow {
  store: string;
  presentOnDisk: boolean;
  includedInArchive: boolean;
  bytes: number;
}

/** The coverage table of the newest run, or null when it cannot be read. */
function readManifestCoverage(
  manifestPath: string,
): { rows: ManifestCoverageRow[]; runId: string | null; takenAt: string | null; archive: string | null } | null {
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
    if (!raw || typeof raw !== "object") return null;
    const rows: ManifestCoverageRow[] = Array.isArray(raw.coverage)
      ? raw.coverage
          .filter((r: any) => r && typeof r.store === "string")
          .map((r: any) => ({
            store: r.store,
            presentOnDisk: r.presentOnDisk === true,
            includedInArchive: r.includedInArchive === true,
            bytes: Number.isFinite(Number(r.bytes)) ? Number(r.bytes) : 0,
          }))
      : [];
    return {
      rows,
      runId: typeof raw.runId === "string" ? raw.runId : null,
      takenAt: typeof raw.takenAt === "string" ? raw.takenAt : null,
      archive: typeof raw.archive === "string" ? raw.archive : null,
    };
  } catch {
    return null;
  }
}

/**
 * Build the owner's answer about the off-box copy. Everything is measured at
 * call time; nothing is cached and nothing is assumed.
 */
export function buildBackupHealthReport(opts: {
  dataDir: string;
  outDir: string;
  namespace: DeploymentNamespace;
  intervalMs: number;
  staleFactor?: number;
  env?: Record<string, string | undefined>;
  scheduler?: BackupHealthReport["scheduler"];
  now?: Date;
}): BackupHealthReport {
  const now = opts.now ?? new Date();
  const dataDir = resolve(opts.dataDir);
  const outDir = resolve(opts.outDir);
  const env = opts.env ?? process.env;
  const factor = opts.staleFactor && opts.staleFactor > 0 ? opts.staleFactor : DEFAULT_STALE_FACTOR;
  const staleAfterMs = Math.round(opts.intervalMs * factor);
  const reasons: string[] = [];

  // ── The durable status every run rewrites ────────────────────────────────
  const statusPath = join(dataDir, "backup_status.json");
  const statusPresent = existsSync(statusPath);
  const s = readBackupStatus(dataDir);
  const rawStatus = (() => {
    try {
      return JSON.parse(readFileSync(statusPath, "utf-8")) as any;
    } catch {
      return null;
    }
  })();
  const lastUploadOkAt: string | null =
    typeof rawStatus?.lastUploadOkAt === "string" ? rawStatus.lastUploadOkAt : null;

  const ageSecondsOf = (iso: string | null): number | null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.round((now.getTime() - t) / 1000));
  };
  const okAge = ageSecondsOf(s.lastBackupOkAt);
  const stale = okAge === null ? true : okAge * 1000 > staleAfterMs;

  // ── What the newest archive says it covered ──────────────────────────────
  const newest = newestRunWithManifest(outDir);
  const manifest = newest ? readManifestCoverage(newest.manifestPath) : null;
  const declared = DURABLE_STORES.length;
  const presentOnDisk = DURABLE_STORES.filter((store) => storePresent(dataDir, store)).length;
  const archivedInLastRun = manifest ? manifest.rows.filter((r) => r.includedInArchive).length : null;
  const uncovered = manifest
    ? manifest.rows.filter((r) => r.presentOnDisk && r.bytes > 0 && !r.includedInArchive).map((r) => r.store)
    : [];
  const declaredSinceManifest = manifest ? Math.max(0, declared - manifest.rows.length) : 0;

  let coverageVerdict: BackupCoverageReport["verdict"] = "unknown";
  let coverageReason: string;
  if (!newest) {
    coverageReason = `No completed run is present in ${outDir}, so there is no coverage table to read.`;
  } else if (!manifest) {
    coverageReason = `The newest run (${newest.runId}) has a manifest that could not be read, so its coverage cannot be checked.`;
  } else if (uncovered.length > 0) {
    coverageVerdict = "red";
    coverageReason = `The newest archive (${newest.runId}) left ${uncovered.length} declared store(s) out while the table claimed coverage: ${uncovered.join(", ")}.`;
  } else if (declaredSinceManifest > 0) {
    coverageVerdict = "red";
    coverageReason = `The newest archive (${newest.runId}) was taken before ${declaredSinceManifest} of the ${declared} declared store(s) existed, so those stores are not in it.`;
  } else {
    coverageVerdict = "green";
    coverageReason = `The newest archive (${newest.runId}) covers all ${manifest.rows.length} declared stores it knew about, and none of them is missing from it.`;
  }

  const r2 = s.lastBackupR2;
  const r2config = describeR2Config(env, { dataDir });
  const uploadAge = ageSecondsOf(lastUploadOkAt ?? r2?.uploadedAt ?? null);

  // ── The verdict ──────────────────────────────────────────────────────────
  let verdict: BackupVerdict = "green";
  const fail = (v: BackupVerdict, reason: string) => {
    if (verdict === "green") verdict = v;
    reasons.push(reason);
  };

  if (!statusPresent) {
    fail(
      "never",
      `No backup status at ${statusPath} — this deployment has never completed a backup run, so nothing in ${dataDir} has a copy off this disk.`,
    );
  } else if (!s.lastBackupOkAt) {
    fail(
      "never",
      `A backup was attempted (last attempt ${s.lastBackupAt ?? "unknown"}) but none has ever succeeded${s.lastBackupError ? ` — last error: ${s.lastBackupError}` : ""}.`,
    );
  } else if (stale) {
    fail(
      "red",
      `The last successful backup was ${okAge}s ago (${s.lastBackupOkAt}), older than the ${Math.round(staleAfterMs / 1000)}s this deployment allows (2.5 × the ${Math.round(opts.intervalMs / 1000)}s interval).`,
    );
  }
  if (statusPresent && (s.consecutiveFailures ?? 0) > 0) {
    fail("red", `${s.consecutiveFailures} consecutive backup run(s) have failed${s.lastBackupError ? ` — last error: ${s.lastBackupError}` : ""}.`);
  }

  if (!r2config.configured) {
    fail(
      "red",
      `The off-box destination is not configured in this environment (missing ${r2config.missing.join(", ") || "R2 credentials"}), so no archive can leave this machine.`,
    );
  } else if (!r2) {
    fail("red", "No off-box upload has ever been recorded for this data directory.");
  } else if (r2.uploaded !== true) {
    fail(
      "red",
      `The last off-box upload did not succeed${r2.error ? ` — ${r2.error}` : r2.uploadSkipped ? ` — skipped: ${r2.uploadSkipped}` : ""}. The archive exists, but it is still on this disk.`,
    );
  } else if (uploadAge !== null && uploadAge * 1000 > staleAfterMs) {
    fail(
      "red",
      `The last successful off-box upload was ${uploadAge}s ago (${lastUploadOkAt ?? r2.uploadedAt}), older than the ${Math.round(staleAfterMs / 1000)}s this deployment allows.`,
    );
  }

  if (coverageVerdict === "red") fail("red", coverageReason);

  if (verdict === "green") {
    reasons.push(
      `The newest archive (${newest?.runId ?? "unknown"}) is uploaded and fresh: last success ${s.lastBackupOkAt} (${okAge}s ago), object ${r2?.key ?? "unknown"} in ${opts.namespace.prefix}.`,
    );
  }
  if (verdict === "green" && coverageVerdict === "unknown") {
    // A green verdict may not rest on a coverage table nobody could read.
    verdict = "unknown";
    reasons.push(coverageReason);
  }

  return {
    ok: verdict === "green",
    verdict,
    reasons,
    dataDir,
    destination: {
      outDir,
      insidePublishTree: isInsidePublishTree(outDir),
      runCount: countRuns(outDir),
      newestRunId: newest?.runId ?? null,
      newestRunAt: manifest?.takenAt ?? null,
    },
    namespace: {
      prefix: opts.namespace.prefix,
      instance: opts.namespace.instance,
      role: opts.namespace.role,
      source: opts.namespace.source,
      reason: opts.namespace.reason,
      configured: r2config.configured,
      missing: r2config.missing,
      bucket: r2config.bucket,
      endpointHost: r2config.endpointHost,
      uploadAllowed: opts.namespace.uploadAllowed,
      skipReason: opts.namespace.skipReason,
    },
    status: {
      path: statusPath,
      present: statusPresent,
      lastRunAt: s.lastBackupAt,
      lastOkAt: s.lastBackupOkAt,
      ageSeconds: okAge,
      staleAfterMs,
      stale,
      staleReason: !statusPresent || !s.lastBackupOkAt ? "never-ran" : stale ? "overdue" : null,
      consecutiveFailures: s.consecutiveFailures ?? 0,
      consecutiveUploadFailures: s.consecutiveUploadFailures ?? 0,
      lastError: s.lastBackupError,
      runId: s.lastBackupRunId,
      files: s.lastBackupFiles,
      encryption: s.lastBackupEncryption,
    },
    upload: {
      configured: r2config.configured,
      uploaded: r2 ? r2.uploaded : null,
      key: r2?.key ?? null,
      uploadedAt: r2?.uploadedAt ?? null,
      bytes: r2?.bytes ?? null,
      error: r2?.error ?? null,
      skipped: r2?.uploadSkipped ?? null,
      lastUploadOkAt,
      ageSeconds: uploadAge,
      prunedCount: r2?.pruned?.length ?? 0,
      pruneError: r2?.pruneError ?? null,
    },
    coverage: {
      declared,
      presentOnDisk,
      archivedInLastRun,
      uncovered,
      declaredSinceManifest,
      manifestPresent: !!newest && !!manifest,
      manifestPath: newest?.manifestPath ?? null,
      runId: manifest?.runId ?? newest?.runId ?? null,
      verdict: coverageVerdict,
      reason: coverageReason,
    },
    scheduler: opts.scheduler ?? null,
    // SLICE 165 — read from the same raw status object as everything else, so a
    // refusal the page shows is a refusal the run actually recorded.
    refusal: refusalFromRaw(rawStatus),
    checkedAt: now.toISOString(),
  };
}
