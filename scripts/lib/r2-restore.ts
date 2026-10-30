/**
 * r2-restore.ts — SLICE 145. The testable half of `scripts/restore-from-r2.mjs`.
 *
 * WHAT THIS PROVES: an object sitting in the bucket is a RESTORABLE RUN, not
 * just bytes that uploaded successfully. Three things are checked, in order,
 * BEFORE anything is written anywhere:
 *   1. the downloaded object's size matches what the bucket reported, so a
 *      truncated download is caught rather than decrypted;
 *   2. it decrypts and extracts (wrong passphrase / corrupt object ⇒ refuse);
 *   3. the manifest inside it is one of ours, its runId is the run we asked
 *      for, and EVERY file digest matches. A tampered manifest — digests that
 *      do not describe the data — is refused here, before the restore path is
 *      handed anything.
 *
 * Then it materialises a normal run directory (manifest.json + the ciphertext)
 * so the EXISTING `scripts/restore.mjs` and `scripts/restore-drill.mjs` do the
 * install and the boot. There is no second restore implementation.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { instanceOfKey, runIdFromObjectKey } from "../../src/lib/r2-upload";
import { isManifest, verifyManifestFiles, type Manifest } from "./backup-core";

export interface RemoteObject {
  key: string;
  size: number;
  etag: string | null;
}

/**
 * Newest run object in the bucket, or the one asked for. Throws when absent.
 *
 * SLICE 147: objects are matched by the RUN ID inside the key at any depth, not
 * by a flat `prefix + runId` shape. That is what keeps the pre-namespacing object
 * (`simplerlife100/backups/2026-10-30T22-00-12Z.tar.gz.enc`) and the per-instance
 * ones (`simplerlife100/backups/<instance>/2026-…Z.tar.gz.enc`) equally
 * restorable from ONE list call at the base prefix — no migration, no orphaning.
 */
export function selectRemoteObject(objects: RemoteObject[], opts: { run?: string | null; prefix: string }): RemoteObject {
  const runObjects = objects
    .filter((o) => o.key.startsWith(opts.prefix))
    .map((o) => ({ object: o, runId: runIdFromObjectKey(o.key) }))
    .filter((entry): entry is { object: RemoteObject; runId: string } => !!entry.runId);
  if (runObjects.length === 0) throw new Error(`no encrypted run objects under ${opts.prefix} in the bucket`);
  if (opts.run) {
    const wanted = runObjects.find((entry) => entry.runId === opts.run);
    if (!wanted) {
      const available = runObjects
        .map((e) => e.object.key)
        .sort()
        .slice(-5);
      throw new Error(`no object for run ${opts.run}; newest objects: ${available.join(", ")}`);
    }
    return wanted.object;
  }
  return [...runObjects].sort((a, b) => (a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0))[0].object;
}

/** The run id inside a remote key (`…/<runId>.tar.gz.enc`), or null. */
export function remoteRunId(key: string): string | null {
  return runIdFromObjectKey(key);
}

/** Which instance namespace an object sits in (`""` = the flat, pre-147 layout). */
export function remoteInstance(key: string, basePrefix: string): string | null {
  return instanceOfKey(key, basePrefix);
}

export interface VerifyExtractedResult {
  manifest: Manifest;
  checked: number;
  bytes: number;
}

/**
 * Verify an extracted object: manifest identity, run id, and every digest.
 * Throws with a specific reason — the caller must abort before writing.
 */
export function verifyExtractedRun(opts: { stageDir: string; requestedRunId: string }): VerifyExtractedResult {
  const manifestPath = join(opts.stageDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`the object does not contain a manifest.json (looked in ${opts.stageDir})`);
  let manifest: any;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e: any) {
    throw new Error(`manifest.json in the object is not valid JSON: ${e?.message || e}`);
  }
  if (!isManifest(manifest)) throw new Error("manifest.json in the object is not a backup manifest");
  if (manifest.runId !== opts.requestedRunId) {
    throw new Error(`manifest runId ${manifest.runId} does not match the requested run ${opts.requestedRunId}`);
  }
  const dataDir = join(opts.stageDir, "data");
  if (!existsSync(dataDir)) throw new Error("the object has a manifest but no data/ tree");
  const verification = verifyManifestFiles(dataDir, manifest);
  if (!verification.ok) {
    const detail = JSON.stringify({
      mismatches: verification.mismatches.slice(0, 3),
      missing: verification.missing.slice(0, 3),
      mismatchCount: verification.mismatches.length,
      missingCount: verification.missing.length,
    });
    throw new Error(`manifest verification failed — refusing to restore a tampered or corrupt object: ${detail}`);
  }
  return { manifest, checked: verification.checked, bytes: verification.bytes };
}

/**
 * Build a run directory the existing restore/drill CLIs accept:
 * `<root>/<runId>/manifest.json` + `<root>/<runId>/<archive>`.
 * The ciphertext is copied byte for byte, so the second decrypt is of the SAME
 * object that came down the wire — not of a re-encryption we produced here.
 */
export function materialiseRunDir(opts: {
  rootDir: string;
  runId: string;
  manifest: Manifest;
  archivePath: string;
  archiveName: string;
}): string {
  const runDir = join(opts.rootDir, opts.runId);
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  copyFileSync(opts.archivePath, join(runDir, opts.archiveName));
  writeFileSync(join(runDir, "manifest.json"), JSON.stringify(opts.manifest, null, 2));
  return runDir;
}

/** Size check on the downloaded body against what the bucket listed. */
export function assertDownloadedSize(downloadedBytes: number, listedSize: number, key: string): void {
  if (listedSize > 0 && downloadedBytes !== listedSize) {
    throw new Error(`downloaded ${downloadedBytes} bytes of ${key} but the bucket listed ${listedSize} — truncated object, refusing`);
  }
}

export function fileSize(path: string): number {
  return statSync(path).size;
}
