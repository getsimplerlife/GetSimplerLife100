#!/usr/bin/env bun
/**
 * backup.mjs — SLICE 143/144. Archive the runtime DATA_DIR to a verified,
 * self-describing snapshot OUTSIDE the publish tree.
 *
 *   bun scripts/backup.mjs                       # backup /home/team/shared/site/.data
 *   bun scripts/backup.mjs --data-dir /path/.data --out /home/team/shared/backups
 *   bun scripts/backup.mjs --keep-daily 7 --keep-weekly 4
 *   BACKUP_PASSPHRASE=… bun scripts/backup.mjs   # encrypted archive
 *
 * WHAT THIS IS: a same-host copy of the files this app actually stores, with a
 * per-file sha256 manifest, a stability check on every read and a COVERAGE
 * assertion against `src/lib/durable-stores.ts`. It survives a bad write, a bad
 * deploy, an accidental delete, or a publish that wipes the data dir. It does
 * NOT survive losing the host, the disk, or the machine — there is no off-box
 * copy. Never describe it as more than that.
 *
 * SLICE 144: this file is now only a CLI. The pipeline itself (pre-flight
 * guards, verified collect, coverage assertion, staged copy, manifest,
 * retention, status file) lives in `scripts/lib/backup-core.ts` as
 * `runBackup()`, because the SERVER runs the same pipeline hourly in-process
 * (src/lib/backup-scheduler.ts). One implementation, two entry points.
 *
 * HARD RULES (see scripts/lib/backup-core.ts for why):
 *   - every file is read twice; a file whose two reads disagree is refused;
 *   - every *.json must re-parse or the whole run fails;
 *   - every declared durable store that holds data must be in the archive;
 *   - prod-server.lock / liveness-watchdog.lock are never archived;
 *   - nothing is ever written under a publish tree (…/site/…);
 *   - an unencrypted run says so, loudly, and chmods itself to 700/600.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runBackup, verifyManifestFiles } from "./lib/backup-core.ts";
import { atomicWriteSync } from "../src/lib/atomic-write.ts";

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

/**
 * Encrypt the staged run dir and PROVE it can be opened: decrypt, extract to a
 * temp dir and re-verify every digest before the plaintext staging tree is
 * removed. An archive nobody can open is not a backup.
 */
function encryptRun(runDir, manifest) {
  const archivePath = join(runDir, manifest.archive);
  const stage = join(runDir, "data");
  const tar = execFileSync("tar", ["-czf", "-", "-C", runDir, "data", "manifest.json"], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  const enc = execFileSync("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-pass", "env:BACKUP_PASSPHRASE"], {
    input: tar,
    maxBuffer: 1024 * 1024 * 1024,
    env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE },
  });
  atomicWriteSync(archivePath, enc);
  chmodSync(archivePath, 0o600);

  const tmp = join(runDir, ".verify");
  mkdirSync(tmp, { recursive: true, mode: 0o700 });
  try {
    const dec = execFileSync(
      "openssl",
      ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-pass", "env:BACKUP_PASSPHRASE", "-in", archivePath],
      { maxBuffer: 1024 * 1024 * 1024, env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE } },
    );
    const tarPath = join(tmp, "payload.tar.gz");
    writeFileSync(tarPath, dec);
    execFileSync("tar", ["-xzf", tarPath, "-C", tmp]);
    const v = verifyManifestFiles(join(tmp, "data"), manifest);
    if (!v.ok) {
      throw new Error(
        `encrypted round-trip verification failed: ${JSON.stringify([...v.mismatches, ...v.missing]).slice(0, 400)}`,
      );
    }
    log(`encrypted round-trip verified: ${v.checked} files, ${v.bytes} bytes`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(stage, { recursive: true, force: true });
  }
  log(`archive ${manifest.archive}`);
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
    encrypt: PASSPHRASE ? encryptRun : undefined,
  });
} catch (e) {
  console.error(`[backup] FAILED: ${e?.message || String(e)}`);
  process.exit(1);
}

if (!PASSPHRASE) {
  log("ENCRYPTION: OFF — this archive contains plaintext OAuth tokens");
  log(`stored under ${result.target} (mode 700, files 600) — same host only, no off-box copy`);
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
    },
    null,
    2,
  ),
);
