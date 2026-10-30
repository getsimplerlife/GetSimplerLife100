#!/usr/bin/env bun
/**
 * backup.mjs — SLICE 143/144/145. Archive the runtime DATA_DIR to a verified,
 * self-describing snapshot OUTSIDE the publish tree, encrypt it, and — when R2
 * is configured — copy it off this machine.
 *
 *   bun scripts/backup.mjs                       # backup /home/team/shared/site/.data
 *   bun scripts/backup.mjs --data-dir /path/.data --out /home/team/shared/backups
 *   bun scripts/backup.mjs --keep-daily 7 --keep-weekly 4
 *   BACKUP_PASSPHRASE=… bun scripts/backup.mjs   # encrypted archive + off-box copy
 *   bun scripts/backup.mjs --no-upload           # local archive only, even if R2 is set
 *
 * WHAT THIS IS: a copy of the files this app actually stores, with a per-file
 * sha256 manifest, a stability check on every read, a COVERAGE assertion
 * against `src/lib/durable-stores.ts`, AES-256-CBC encryption under
 * BACKUP_PASSPHRASE, and an upload of THAT ENCRYPTED OBJECT to the owner's R2
 * bucket. Never describe it as more than that: there is no uptime promise, no
 * disaster-recovery guarantee and nothing customer-facing may say "backup".
 *
 * SLICE 144: this file is only a CLI. The pipeline itself lives in
 * `scripts/lib/backup-core.ts` as `runBackup()`, because the SERVER runs the
 * same pipeline hourly in-process (src/lib/backup-scheduler.ts).
 *
 * SLICE 145: encryption moved to `scripts/lib/backup-crypto.ts` and the upload
 * to `scripts/lib/r2-backup.ts`, for the same reason — the server must produce
 * the identical encrypted object, and there is exactly one implementation.
 *
 * HARD RULES (see scripts/lib/backup-core.ts for why):
 *   - every file is read twice; a file whose two reads disagree is refused;
 *   - every *.json must re-parse or the whole run fails;
 *   - every declared durable store that holds data must be in the archive;
 *   - prod-server.lock / liveness-watchdog.lock are never archived;
 *   - nothing is ever written under a publish tree (…/site/…);
 *   - an unencrypted run says so, loudly, and never leaves this machine;
 *   - a failed upload is recorded and reported, but does not fail the local run.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { runBackup } from "./lib/backup-core.ts";
import { makeEncryptHook } from "./lib/backup-crypto.ts";
import { uploadVerifiedRun } from "./lib/r2-backup.ts";

const DEFAULT_DATA_DIR = process.env.DATA_DIR?.trim() || "/home/team/shared/site/.data";
const DEFAULT_OUT = process.env.BACKUP_ROOT?.trim() || "/home/team/shared/backups";

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const DATA_DIR = resolve(String(arg("data-dir", DEFAULT_DATA_DIR)));
const OUT_DIR = resolve(String(arg("out", DEFAULT_OUT)));
const KEEP_DAILY = Number(arg("keep-daily", 7));
const KEEP_WEEKLY = Number(arg("keep-weekly", 4));
const NO_PRUNE = !!arg("no-prune", false);
const NO_STATUS = !!arg("no-status", false);
const NO_UPLOAD = !!arg("no-upload", false);
const PASSPHRASE = process.env.BACKUP_PASSPHRASE?.trim() || "";

function log(msg) {
  console.log(`[backup] ${msg}`);
}

function gitSha() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

let result;
try {
  result = runBackup({
    dataDir: DATA_DIR,
    outDir: OUT_DIR,
    keepDaily: KEEP_DAILY,
    keepWeekly: KEEP_WEEKLY,
    noPrune: NO_PRUNE,
    noStatus: NO_STATUS,
    now: new Date(),
    gitSha: gitSha(),
    durableEnabled: !!process.env.DATABASE_URL,
    log,
    encrypt: makeEncryptHook(PASSPHRASE, log),
  });
} catch (e) {
  console.error(`[backup] FAILED: ${e?.message || String(e)}`);
  process.exit(1);
}

if (!PASSPHRASE) {
  log("ENCRYPTION: OFF — this archive contains plaintext OAuth tokens");
  log(`stored under ${result.target} (mode 700, files 600) — same host only, no off-box copy`);
}

// ── Off-box leg (SLICE 145): only after the local archive verified ──────────
// `runBackup` returned, which means every digest, the coverage assertion and
// (when encrypting) the decrypt-and-re-verify round trip all passed.
let r2 = null;
if (NO_UPLOAD) {
  log("r2: SKIPPED — --no-upload");
} else {
  r2 = await uploadVerifiedRun({
    dataDir: DATA_DIR,
    runDir: result.target,
    manifest: result.manifest,
    passphrase: PASSPHRASE,
    keepDaily: KEEP_DAILY,
    keepWeekly: KEEP_WEEKLY,
    persist: !NO_STATUS,
    log,
  });
}

const t = result.manifest.totals;
console.log(
  JSON.stringify(
    {
      ok: true,
      runId: result.runId,
      target: result.target,
      encryption: result.manifest.encryption,
      files: t.files,
      bytes: t.bytes,
      jsonFiles: t.jsonFiles,
      vaultBlobs: t.vaultBlobs,
      nativeDocs: t.nativeDocs,
      otherFiles: t.otherFiles,
      excluded: result.manifest.excluded,
      coverage: result.coverage,
      pruned: result.pruned,
      r2,
    },
    null,
    2,
  ),
);
