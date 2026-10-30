/**
 * r2-backup.ts — SLICE 145. The one place a run's bytes may leave this box.
 *
 * THE GATE, in this order (each step is a test in
 * src/test/r2-offbox-145.test.ts):
 *   1. the local run already succeeded — `uploadVerifiedRun` is only ever
 *      called with a `runDir` that `runBackup()` returned, so the archive is
 *      digest-verified and coverage-checked BEFORE anything is uploaded;
 *   2. R2 is configured (all four bucket variables present) — otherwise no
 *      network call at all, and `uploadSkipped` says which names are missing;
 *   3. BACKUP_PASSPHRASE is set AND the run produced an encrypted archive —
 *      otherwise no network call at all, `uploadSkipped: "no passphrase"`.
 *      Plaintext client data (OAuth tokens, customer PDFs) must never leave
 *      this machine, and the only way to guarantee that is to refuse rather
 *      than to "upload what we have".
 *
 * AFTER AN UPLOAD: the same 7-daily / 4-weekly retention runs against the
 * bucket, computed by the SAME function the local archive uses. A failed prune
 * is recorded (`pruneError`) and never fails the run; a failed UPLOAD is
 * recorded (`error`) and never fails the run either — the scheduler keeps
 * scheduling and the server keeps serving, with the failure visible on
 * /api/admin/datadir.
 *
 * NOTHING HERE THROWS. Callers are the backup CLI and the in-server hourly
 * scheduler; an exception escaping into the scheduler is how a "backup feature"
 * takes down a server.
 */
import { chmodSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  createR2Client,
  describeR2Config,
  objectKeyForRun,
  planRemoteRetention,
  r2ConfigFromEnv,
  redactSecrets,
  resolveUploadPrefix,
  type R2Fetch,
} from "../../src/lib/r2-upload";
import { atomicWriteSync } from "../../src/lib/atomic-write";
import { backupEventLine } from "../../src/lib/backup-status";
import { sha256Of, statusFor, writeBackupStatus, type Manifest, type R2Record } from "./backup-core";

/** A record for a run where nothing was attempted, with the honest reason. */
export function skippedRecord(opts: { configured: boolean; reason: string }): R2Record {
  return {
    configured: opts.configured,
    uploaded: false,
    key: null,
    bytes: null,
    etag: null,
    uploadedAt: null,
    error: null,
    uploadSkipped: opts.reason,
    pruned: [],
    pruneError: null,
  };
}

export interface UploadVerifiedRunOptions {
  dataDir: string;
  runDir: string;
  manifest: Manifest;
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Defaults to env.BACKUP_PASSPHRASE. */
  passphrase?: string | null;
  /** Tests inject a fake; production uses global fetch. */
  fetchImpl?: R2Fetch;
  now?: () => Date;
  log?: (msg: string) => void;
  keepDaily?: number;
  keepWeekly?: number;
  /** When false the manifest/status files are left untouched (tests). */
  persist?: boolean;
}

/**
 * Upload the run's ENCRYPTED archive, record the outcome in the manifest and in
 * backup_status.json, then prune the bucket with the shared retention policy.
 * Never throws.
 */
export async function uploadVerifiedRun(opts: UploadVerifiedRunOptions): Promise<R2Record> {
  const log = opts.log ?? (() => {});
  const env = opts.env ?? process.env;
  const persist = opts.persist !== false;
  const passphrase = (opts.passphrase ?? env.BACKUP_PASSPHRASE ?? "").trim();
  // SLICE 147: this run's own namespace. Resolving it CREATES the instance id on
  // first use, so the id is stable from the first upload onwards.
  const resolved = resolveUploadPrefix({ env, dataDir: opts.dataDir, create: true, now: opts.now });
  const report = describeR2Config(env, { dataDir: opts.dataDir });

  const record = (r: R2Record): R2Record => {
    if (persist) persistRecord(opts, r, log);
    return r;
  };

  const cfg = r2ConfigFromEnv(env, { dataDir: opts.dataDir });
  if (!cfg) {
    log(`[backup] r2: NOT CONFIGURED (missing ${report.missing.join(", ")}) — no off-box copy of this run`);
    return record(skippedRecord({ configured: false, reason: `not configured (missing ${report.missing.join(", ")})` }));
  }
  if (!resolved.uploadAllowed) {
    // SLICE 147: a dev/test runtime must never place an object where it can be
    // mistaken for (or prune) production data.
    log(`[backup] r2: SKIPPED — ${resolved.skipReason}`);
    return record({
      ...skippedRecord({ configured: true, reason: resolved.skipReason || "non-production runtime" }),
      prefix: resolved.prefix,
      instance: resolved.instance,
    });
  }
  if (!passphrase) {
    // The plaintext gate. This is the whole point: no passphrase ⇒ no upload.
    log("[backup] r2: SKIPPED — BACKUP_PASSPHRASE is not set, so this run is unencrypted; plaintext data never leaves this box");
    return record({ ...skippedRecord({ configured: true, reason: "no passphrase" }), prefix: resolved.prefix, instance: resolved.instance });
  }
  if (!opts.manifest.archive || opts.manifest.encryption === "off") {
    log("[backup] r2: SKIPPED — the run produced no encrypted archive, so there is nothing safe to upload");
    return record({ ...skippedRecord({ configured: true, reason: "run is not encrypted" }), prefix: resolved.prefix, instance: resolved.instance });
  }

  const archivePath = join(opts.runDir, opts.manifest.archive);
  if (!existsSync(archivePath)) {
    return record({
      ...skippedRecord({ configured: true, reason: "archive missing on disk" }),
      error: `archive ${opts.manifest.archive} is not present in ${opts.runDir}`,
      uploadSkipped: null,
      prefix: resolved.prefix,
      instance: resolved.instance,
    });
  }

  const key = objectKeyForRun(cfg.prefix, opts.manifest.runId, opts.manifest.archive);
  const client = createR2Client({ config: cfg, fetchImpl: opts.fetchImpl, now: opts.now, log });

  let bytes = 0;
  let etag: string | null = null;
  const startedAt = (opts.now ?? (() => new Date()))().toISOString();
  try {
    const body = new Uint8Array(readFileSync(archivePath));
    bytes = body.length;
    // A sanity check that costs nothing: the object we are about to send is the
    // file on disk, so its size is knowable before the request and reportable
    // after it even if the response is lost.
    const localSize = statSync(archivePath).size;
    if (localSize !== bytes) throw new Error(`archive changed while reading it (${localSize} vs ${bytes})`);
    const put = await client.putObject(key, body);
    etag = put.etag;
    log(`[backup] r2: uploaded ${key} (${bytes} bytes${etag ? `, etag ${etag}` : ""})`);
  } catch (e: any) {
    const error = redactSecrets(e?.message || String(e), [cfg.accessKeyId, cfg.secretAccessKey, passphrase]);
    log(`[backup] r2: UPLOAD FAILED for ${key} — ${error} (the local archive is intact; the run is NOT off-box)`);
    const failed: R2Record = {
      configured: true,
      uploaded: false,
      key: null,
      bytes: null,
      etag: null,
      uploadedAt: null,
      error,
      uploadSkipped: null,
      pruned: [],
      pruneError: null,
      prefix: resolved.prefix,
      instance: resolved.instance,
    };
    const written = record(failed);
    log(
      backupEventLine("upload-failed", {
        key,
        instance: resolved.instance,
        prefix: resolved.prefix,
        error,
        consecutiveUploadFailures: opts.persist === false ? null : readDurableCounters(opts.dataDir).uploadFailures,
      }),
    );
    return written;
  }

  const rec: R2Record = {
    configured: true,
    uploaded: true,
    key,
    bytes,
    etag,
    uploadedAt: startedAt,
    error: null,
    uploadSkipped: null,
    pruned: [],
    pruneError: null,
    prefix: resolved.prefix,
    instance: resolved.instance,
  };

  // ── Remote retention: same policy, same function, never fatal ─────────────
  // SLICE 147: this lists THIS INSTANCE'S prefix only, so the plan can only ever
  // name objects this instance wrote. Anything deeper (another instance's
  // namespace) is reported as foreign and never deleted.
  try {
    const objects = await client.listObjects(cfg.prefix);
    const plan = planRemoteRetention(
      objects.map((o) => o.key),
      { prefix: cfg.prefix, daily: opts.keepDaily ?? 7, weekly: opts.keepWeekly ?? 4 },
    );
    for (const oldKey of plan.prune) {
      if (oldKey === key) continue; // never prune the run we just wrote
      await client.deleteObject(oldKey);
      rec.pruned.push(oldKey);
    }
    if (plan.foreign.length > 0) {
      rec.foreign = plan.foreign;
      log(
        backupEventLine("retention-foreign", {
          prefix: cfg.prefix,
          instance: resolved.instance,
          count: plan.foreign.length,
          // Never delete what we cannot attribute. This is the cross-instance rule.
          action: "kept",
        }),
      );
    }
    log(`[backup] r2: retention kept ${plan.keep.length} object(s), pruned ${rec.pruned.length} in ${cfg.prefix}`);
  } catch (e: any) {
    rec.pruneError = redactSecrets(e?.message || String(e), [cfg.accessKeyId, cfg.secretAccessKey, passphrase]);
    log(`[backup] r2: WARNING — retention prune failed: ${rec.pruneError} (the upload itself succeeded)`);
  }

  return record(rec);
}

/**
 * The durable counters, read AFTER the status write so the number in the log is
 * the number an operator will see on /api/admin/datadir. Never throws.
 */
function readDurableCounters(dataDir: string): { runFailures: number | null; uploadFailures: number | null } {
  try {
    const raw = JSON.parse(readFileSync(join(dataDir, "backup_status.json"), "utf8"));
    const asNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : null);
    return { runFailures: asNum(raw?.consecutiveFailures), uploadFailures: asNum(raw?.consecutiveUploadFailures) };
  } catch {
    return { runFailures: null, uploadFailures: null };
  }
}

/** Write the outcome into manifest.json and backup_status.json. Never throws. */
function persistRecord(opts: UploadVerifiedRunOptions, r2: R2Record, log: (m: string) => void): void {
  try {
    const manifest: Manifest = { ...opts.manifest, r2 };
    const manifestPath = join(opts.runDir, "manifest.json");
    if (existsSync(manifestPath)) {
      atomicWriteSync(manifestPath, JSON.stringify(manifest, null, 2));
      try {
        chmodSync(manifestPath, 0o600);
      } catch {
        /* atomicWriteSync keeps the existing mode */
      }
    }
    writeBackupStatus(opts.dataDir, statusFor(manifest, opts.runDir, null, r2));
  } catch (e: any) {
    // The archive and the upload both succeeded; failing to write status must
    // not turn a good run into a bad one — but it must be said out loud.
    log(`[backup] r2: WARNING — could not persist the r2 record: ${e?.message || e}`);
  }
}

/** Local archive digest, for the drill and the restore path to compare against. */
export function archiveDigest(runDir: string, archiveName: string): string {
  return sha256Of(readFileSync(join(runDir, archiveName)));
}
