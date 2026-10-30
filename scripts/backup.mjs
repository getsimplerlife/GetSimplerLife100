#!/usr/bin/env bun
/**
 * backup.mjs — SLICE 143. Archive the runtime DATA_DIR to a verified,
 * self-describing snapshot OUTSIDE the publish tree.
 *
 *   bun scripts/backup.mjs                       # backup /home/team/shared/site/.data
 *   bun scripts/backup.mjs --data-dir /path/.data --out /home/team/shared/backups
 *   bun scripts/backup.mjs --keep-daily 7 --keep-weekly 4
 *   BACKUP_PASSPHRASE=… bun scripts/backup.mjs   # encrypted archive
 *
 * WHAT THIS IS: a same-host copy of the files this app actually stores, with a
 * per-file sha256 manifest and a stability check on every read. It survives a
 * bad write, a bad deploy, an accidental delete, or a publish that wipes the
 * data dir. It does NOT survive losing the host, the disk, or the machine —
 * there is no off-box copy. Never describe it as more than that.
 *
 * HARD RULES (see scripts/lib/backup-core.ts for why):
 *   - every file is read twice; a file whose two reads disagree is refused;
 *   - every *.json must re-parse or the whole run fails;
 *   - prod-server.lock / liveness-watchdog.lock are never archived;
 *   - nothing is ever written under a publish tree (…/site/…);
 *   - an unencrypted run says so, loudly, and chmods itself to 700/600.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  BACKUP_STATUS_FILE,
  buildManifest,
  collectVerifiedFiles,
  failedStatus,
  planRetention,
  runIdFor,
  sha256Of,
  statusFor,
  verifyManifestFiles,
} from "./lib/backup-core.ts";

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
const STARTED = new Date();
const RUN_ID = runIdFor(STARTED);
const RUN_DIR = join(OUT_DIR, RUN_ID);

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

function writeStatus(status) {
  if (NO_STATUS) return;
  try {
    const file = join(DATA_DIR, BACKUP_STATUS_FILE);
    writeFileSync(file, JSON.stringify(status, null, 2));
    chmodSync(file, 0o600);
  } catch (e) {
    log(`WARNING: could not write ${BACKUP_STATUS_FILE}: ${e?.message || e}`);
  }
}

function fail(reason) {
  console.error(`[backup] FAILED: ${reason}`);
  writeStatus(failedStatus(STARTED.toISOString(), RUN_DIR, String(reason)));
  process.exit(1);
}

// ── Pre-flight: refuse anything that could destroy or mislead ────────────────
if (!existsSync(DATA_DIR) || !statSync(DATA_DIR).isDirectory()) fail(`DATA_DIR does not exist: ${DATA_DIR}`);
if (/\/shared\/site\//.test(OUT_DIR) || OUT_DIR.endsWith("/site") || OUT_DIR.includes("/site/")) {
  fail(`refusing to write a backup inside the publish tree: ${OUT_DIR}`);
}
if (OUT_DIR === DATA_DIR || OUT_DIR.startsWith(DATA_DIR + "/")) {
  fail(`refusing to write a backup inside the data dir it is archiving: ${OUT_DIR}`);
}
if (existsSync(RUN_DIR)) fail(`run dir already exists (two runs in the same second?): ${RUN_DIR}`);

mkdirSync(OUT_DIR, { recursive: true, mode: 0o700 });
mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
chmodSync(RUN_DIR, 0o700);

// ── Collect + verify (torn-write defence, JSON re-parse) ─────────────────────
let collected;
try {
  collected = collectVerifiedFiles(DATA_DIR);
} catch (e) {
  fail(e?.message || String(e));
}

log(`source ${DATA_DIR}`);
log(`run    ${RUN_ID}`);
log(`files  ${collected.totals.files} (${collected.totals.jsonFiles} json, ${collected.totals.vaultBlobs} vault blobs, ${collected.totals.nativeDocs} native docs, ${collected.totals.otherFiles} other), ${collected.totals.bytes} bytes`);

// Copy the bytes we already verified, then prove the copy is byte-identical.
const stage = join(RUN_DIR, "data");
mkdirSync(stage, { recursive: true, mode: 0o700 });
for (const f of collected.files) {
  const src = join(DATA_DIR, f.path);
  const dst = join(stage, f.path);
  mkdirSync(dirname(dst), { recursive: true, mode: 0o700 });
  try {
    copyFileSync(src, dst);
    chmodSync(dst, 0o600);
  } catch (e) {
    fail(`could not copy ${f.path}: ${e?.message || e}`);
  }
  const copied = sha256Of(readFileSync(dst));
  if (copied !== f.sha256) {
    fail(`copy of ${f.path} does not match the verified source digest (source changed mid-run?)`);
  }
}

const manifest = buildManifest({
  runId: RUN_ID,
  takenAt: STARTED.toISOString(),
  source: {
    host: hostname(),
    dataDir: DATA_DIR,
    gitSha: gitSha(),
    durableEnabled: !!process.env.DATABASE_URL,
  },
  files: collected.files,
  totals: collected.totals,
  excluded: collected.excluded,
  encryption: PASSPHRASE ? "openssl-aes-256-cbc" : "off",
  archive: PASSPHRASE ? `${RUN_ID}.tar.gz.enc` : null,
});
writeFileSync(join(RUN_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
chmodSync(join(RUN_DIR, "manifest.json"), 0o600);

// ── Encrypt when a passphrase is configured; otherwise say so out loud ──────
if (PASSPHRASE) {
  const archivePath = join(RUN_DIR, manifest.archive);
  try {
    const tar = execFileSync("tar", ["-czf", "-", "-C", RUN_DIR, "data", "manifest.json"], {
      maxBuffer: 1024 * 1024 * 1024,
    });
    const enc = execFileSync(
      "openssl",
      ["enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-pass", `env:BACKUP_PASSPHRASE`],
      { input: tar, maxBuffer: 1024 * 1024 * 1024, env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE } },
    );
    writeFileSync(archivePath, enc);
    chmodSync(archivePath, 0o600);
  } catch (e) {
    fail(`encryption failed: ${e?.message || e}`);
  }
  // Round-trip proof: decrypt, extract to a temp dir and re-verify every digest
  // BEFORE the plaintext staging tree is removed. An archive nobody can open is
  // not a backup.
  const tmp = join(RUN_DIR, ".verify");
  mkdirSync(tmp, { recursive: true, mode: 0o700 });
  try {
    const dec = execFileSync(
      "openssl",
      ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-pass", "env:BACKUP_PASSPHRASE", "-in", join(RUN_DIR, manifest.archive)],
      { maxBuffer: 1024 * 1024 * 1024, env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE } },
    );
    const tarPath = join(tmp, "payload.tar.gz");
    writeFileSync(tarPath, dec);
    execFileSync("tar", ["-xzf", tarPath, "-C", tmp]);
    const v = verifyManifestFiles(join(tmp, "data"), manifest);
    if (!v.ok) fail(`encrypted round-trip verification failed: ${JSON.stringify([...v.mismatches, ...v.missing]).slice(0, 400)}`);
    log(`encrypted round-trip verified: ${v.checked} files, ${v.bytes} bytes`);
  } catch (e) {
    fail(`encrypted round-trip verification failed: ${e?.message || e}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(stage, { recursive: true, force: true });
  }
  log(`archive ${manifest.archive}`);
} else {
  log("ENCRYPTION: OFF — this archive contains plaintext OAuth tokens");
  log(`stored under ${RUN_DIR} (mode 700, files 600) — same host only, no off-box copy`);
}

// ── Retention: 7 daily + 4 weekly, never the run we just made ───────────────
let pruned = [];
if (!NO_PRUNE) {
  const runs = readdirSync(OUT_DIR)
    .filter((name) => {
      try {
        return statSync(join(OUT_DIR, name)).isDirectory() && existsSync(join(OUT_DIR, name, "manifest.json"));
      } catch {
        return false;
      }
    })
    .sort();
  const plan = planRetention(runs, { daily: KEEP_DAILY, weekly: KEEP_WEEKLY });
  for (const runId of plan.prune) {
    if (runId === RUN_ID) continue; // never prune the run we just wrote
    const dir = join(OUT_DIR, runId);
    let bytes = 0;
    try {
      for (const f of readdirSync(dir)) {
        try {
          bytes += statSync(join(dir, f)).size;
        } catch {}
      }
      rmSync(dir, { recursive: true, force: true });
      pruned.push({ runId, bytes });
      log(`pruned ${runId} (${bytes} bytes)`);
    } catch (e) {
      log(`WARNING: could not prune ${runId}: ${e?.message || e}`);
    }
  }
  log(`retention: keep ${plan.keep.length} run(s), pruned ${pruned.length}`);
}

writeStatus(statusFor(manifest, RUN_DIR));

console.log(
  JSON.stringify(
    {
      ok: true,
      runId: RUN_ID,
      target: RUN_DIR,
      encryption: manifest.encryption,
      files: manifest.totals.files,
      bytes: manifest.totals.bytes,
      jsonFiles: manifest.totals.jsonFiles,
      vaultBlobs: manifest.totals.vaultBlobs,
      nativeDocs: manifest.totals.nativeDocs,
      otherFiles: manifest.totals.otherFiles,
      excluded: manifest.excluded,
      pruned,
    },
    null,
    2,
  ),
);
