#!/usr/bin/env bun
/**
 * restore.mjs — SLICE 143. The half that matters: turn a backup run back into a
 * data directory we can boot the app on.
 *
 *   bun scripts/restore.mjs                        # newest run → /tmp/restore-<runId>
 *   bun scripts/restore.mjs --run 2026-10-30T20-11-58Z
 *   bun scripts/restore.mjs --target /tmp/mydir --force
 *
 * RULES (fail-closed, in this order):
 *   1. the manifest must exist and look like one of ours;
 *   2. EVERY file's sha256 must match the manifest BEFORE anything is written —
 *      one mismatched byte aborts the restore;
 *   3. the target must be empty, or you must pass --force (an accidental
 *      restore over a live data dir is how a "backup" becomes data loss);
 *   4. restored files are chmod 600 and directories 700 — they hold OAuth
 *      tokens and customer documents;
 *   5. every installed file is re-hashed after the copy, so a short write is a
 *      failure, not a success message.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isManifest, sha256Of, verifyManifestFiles } from "./lib/backup-core.ts";
import { decryptArchiveToDir } from "./lib/backup-crypto.ts";

const DEFAULT_OUT = process.env.BACKUP_ROOT?.trim() || "/home/team/shared/backups";

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const OUT_DIR = resolve(String(arg("out", DEFAULT_OUT)));
const FORCE = !!arg("force", false);
const PASSPHRASE = process.env.BACKUP_PASSPHRASE?.trim() || "";

function log(msg) {
  console.log(`[restore] ${msg}`);
}

function die(reason) {
  console.error(`[restore] FAILED: ${reason}`);
  process.exit(1);
}

function latestRun() {
  let best = null;
  for (const name of readdirSync(OUT_DIR)) {
    const dir = join(OUT_DIR, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
      if (!existsSync(join(dir, "manifest.json"))) continue;
      if (!best || name > best) best = name;
    } catch {}
  }
  return best;
}

const requested = arg("run", null);
const runId = requested && requested !== true ? String(requested) : latestRun();
if (!runId) die(`no backup runs found under ${OUT_DIR}`);

const RUN_DIR = join(OUT_DIR, runId);
const manifestPath = join(RUN_DIR, "manifest.json");
if (!existsSync(manifestPath)) die(`no manifest at ${manifestPath}`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (e) {
  die(`manifest is not valid JSON: ${e?.message || e}`);
}
if (!isManifest(manifest)) die(`manifest at ${manifestPath} is not a backup manifest`);

const TARGET = resolve(String(arg("target", `/tmp/restore-${runId}`)));
const liveDataDir = resolve(process.env.DATA_DIR?.trim() || "/home/team/shared/site/.data");
if (TARGET === liveDataDir && !FORCE) {
  die(`target is the LIVE data dir (${TARGET}); pass --force only if you are deliberately recovering over it`);
}
if (TARGET === OUT_DIR || TARGET.startsWith(OUT_DIR + "/")) {
  die(`refusing to restore into the backup root itself: ${TARGET}`);
}

// ── Stage: decrypt (if needed) into a scratch dir, never over the target ────
let stageDir = RUN_DIR;
let tempStage = null;
if (manifest.archive) {
  if (!PASSPHRASE) die(`run ${runId} is encrypted but BACKUP_PASSPHRASE is not set`);
  tempStage = join("/tmp", `restore-stage-${runId}-${process.pid}`);
  mkdirSync(tempStage, { recursive: true, mode: 0o700 });
  try {
    // SLICE 145: the decrypt lives in scripts/lib/backup-crypto.ts so the CLI,
    // the server and restore-from-r2 all open an archive the same way.
    decryptArchiveToDir({
      archivePath: join(RUN_DIR, manifest.archive),
      outDir: tempStage,
      passphrase: PASSPHRASE,
      log,
    });
    stageDir = join(tempStage, "data");
  } catch (e) {
    rmSync(tempStage, { recursive: true, force: true });
    die(`could not decrypt ${manifest.archive}: ${e?.message || e}`);
  }
} else {
  stageDir = join(RUN_DIR, "data");
}
if (!existsSync(stageDir)) {
  if (tempStage) rmSync(tempStage, { recursive: true, force: true });
  die(`staged data missing at ${stageDir}`);
}

// ── Verify every digest BEFORE writing anything to the target ───────────────
const verification = verifyManifestFiles(stageDir, manifest);
if (!verification.ok) {
  if (tempStage) rmSync(tempStage, { recursive: true, force: true });
  const detail = JSON.stringify({ mismatches: verification.mismatches.slice(0, 5), missing: verification.missing.slice(0, 5) });
  die(`manifest verification failed — refusing to restore: ${detail}`);
}
log(`verified ${verification.checked} files (${verification.bytes} bytes) against the manifest`);

// ── Target guard: empty, or --force ─────────────────────────────────────────
if (existsSync(TARGET)) {
  const entries = readdirSync(TARGET);
  if (entries.length > 0) {
    if (!FORCE) {
      if (tempStage) rmSync(tempStage, { recursive: true, force: true });
      die(`target ${TARGET} exists and is not empty (${entries.length} entries) — pass --force to overwrite`);
    }
    log(`--force: clearing ${entries.length} existing entries in ${TARGET}`);
    for (const name of entries) rmSync(join(TARGET, name), { recursive: true, force: true });
  }
} else {
  mkdirSync(TARGET, { recursive: true, mode: 0o700 });
}
chmodSync(TARGET, 0o700);

// ── Install, then re-hash what we installed ────────────────────────────────
let installed = 0;
let installedBytes = 0;
for (const f of manifest.files) {
  const src = join(stageDir, f.path);
  const dst = join(TARGET, f.path);
  mkdirSync(dirname(dst), { recursive: true, mode: 0o700 });
  try {
    copyFileSync(src, dst);
    chmodSync(dst, 0o600);
  } catch (e) {
    die(`could not write ${f.path}: ${e?.message || e}`);
  }
  const actual = sha256Of(readFileSync(dst));
  if (actual !== f.sha256) die(`installed copy of ${f.path} does not match the manifest digest`);
  installed++;
  installedBytes += f.bytes;
}

if (tempStage) rmSync(tempStage, { recursive: true, force: true });

log(`restored ${installed} files (${installedBytes} bytes) to ${TARGET}`);
console.log(
  JSON.stringify(
    {
      ok: true,
      runId: manifest.runId,
      takenAt: manifest.takenAt,
      target: TARGET,
      encryption: manifest.encryption,
      files: installed,
      bytes: installedBytes,
      verified: verification.checked,
    },
    null,
    2,
  ),
);
