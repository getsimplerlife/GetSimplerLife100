#!/usr/bin/env bun
/**
 * restore-from-r2.mjs — SLICE 145. The point of the exercise: get a run back
 * from the bucket, prove it is intact, and hand it to the EXISTING restore.
 *
 *   bun scripts/restore-from-r2.mjs                       # newest object
 *   bun scripts/restore-from-r2.mjs --run 2026-10-30T20-11-58Z
 *   bun scripts/restore-from-r2.mjs --run … --drill       # boot the server too
 *   bun scripts/restore-from-r2.mjs --run … --target /tmp/mydir --keep
 *
 * ORDER OF OPERATIONS (each step aborts the whole command):
 *   1. R2 must be configured and BACKUP_PASSPHRASE must be set — an off-box
 *      object is always encrypted, so without the passphrase there is nothing
 *      to open and we say so instead of downloading bytes we cannot use;
 *   2. list the prefix and pick the run (or the newest one);
 *   3. download the object into scratch and check its size against the bucket;
 *   4. decrypt + extract, then verify the manifest: it must be ours, its runId
 *      must be the run we asked for, and every file digest must match. A
 *      tampered or corrupt object is refused HERE, before any write;
 *   5. materialise a normal run dir and hand it to `scripts/restore.mjs`
 *      (or `scripts/restore-drill.mjs` with --drill) — the install, the
 *      digest re-check on install, the credential neutralisation, the boot and
 *      the /api/admin/datadir assertions are that code's job, not a copy here.
 *   6. remove the scratch unless --keep.
 *
 * NOTHING IS PRINTED THAT COULD LEAK: no key, no passphrase, no object body.
 * The bucket, the key and the etag are identifiers, not credentials.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createR2Client, describeR2Config, r2ConfigFromEnv } from "../src/lib/r2-upload.ts";
import { decryptArchiveToDir } from "./lib/backup-crypto.ts";
import { assertDownloadedSize, materialiseRunDir, selectRemoteObject, verifyExtractedRun } from "./lib/r2-restore.ts";

const REPO = resolve(import.meta.dir, "..");

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const DRILL = process.argv.includes("--drill");
const KEEP = process.argv.includes("--keep");
const RUN_ARG = arg("run", null);
const PASSPHRASE = (process.env.BACKUP_PASSPHRASE || "").trim();

function log(msg) {
  console.log(`[r2-restore] ${msg}`);
}
function die(reason) {
  console.error(`[r2-restore] FAILED: ${reason}`);
  cleanup(1);
}

let scratch = null;
let handoffRoot = null;
function cleanup(code) {
  if (!KEEP) {
    for (const dir of [scratch, handoffRoot]) {
      if (dir && existsSync(dir)) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {}
      }
    }
  } else {
    log(`--keep: scratch kept at ${scratch}`);
  }
  process.exit(code);
}

const report = describeR2Config(process.env);
const cfg = r2ConfigFromEnv(process.env);
if (!cfg) {
  console.error(`[r2-restore] FAILED: R2 is not configured (missing ${report.missing.join(", ")}) — nothing to restore from`);
  process.exit(1);
}
if (!PASSPHRASE) {
  console.error("[r2-restore] FAILED: BACKUP_PASSPHRASE is not set — the off-box object is encrypted and cannot be opened");
  process.exit(1);
}

const client = createR2Client({ config: cfg });
const now = new Date();
scratch = join("/tmp", `r2-restore-${now.toISOString().replace(/[:.]/g, "-")}-${process.pid}`);
mkdirSync(scratch, { recursive: true, mode: 0o700 });

// ── 1. Which object? ────────────────────────────────────────────────────────
let objects;
try {
  objects = await client.listObjects(cfg.prefix);
} catch (e) {
  console.error(`[r2-restore] FAILED: could not list ${cfg.prefix} — ${e?.message || e}`);
  cleanup(1);
}
log(`bucket prefix ${cfg.prefix}: ${objects.length} object(s)`);

let chosen;
try {
  chosen = selectRemoteObject(objects, { run: RUN_ARG && RUN_ARG !== true ? String(RUN_ARG) : null, prefix: cfg.prefix });
} catch (e) {
  console.error(`[r2-restore] FAILED: ${e?.message || e}`);
  cleanup(1);
}
const runId = chosen.key.slice(cfg.prefix.length).replace(/\..*$/, "");
log(`selected ${chosen.key} (${chosen.size} bytes, etag ${chosen.etag || "unknown"})`);

// ── 2. Download + size check ────────────────────────────────────────────────
const archivePath = join(scratch, basename(chosen.key));
let etag = null;
let downloaded = 0;
try {
  const got = await client.getObject(chosen.key);
  etag = got.etag || chosen.etag;
  downloaded = got.bytes.length;
  writeFileSync(archivePath, got.bytes, { mode: 0o600 });
  assertDownloadedSize(downloaded, chosen.size, chosen.key);
} catch (e) {
  console.error(`[r2-restore] FAILED: could not download ${chosen.key} — ${e?.message || e}`);
  cleanup(1);
}
log(`downloaded ${downloaded} bytes (bucket said ${chosen.size})`);

// ── 3. Decrypt + verify, BEFORE anything is written anywhere else ───────────
const stage = join(scratch, "stage");
let manifest;
let verification;
try {
  decryptArchiveToDir({ archivePath, outDir: stage, passphrase: PASSPHRASE, log });
  verification = verifyExtractedRun({ stageDir: stage, requestedRunId: runId });
  manifest = verification.manifest;
} catch (e) {
  console.error(`[r2-restore] FAILED: ${e?.message || e}`);
  cleanup(1);
}
log(`decrypted and verified ${verification.checked} files (${verification.bytes} bytes) against the manifest inside the object`);

// ── 4. Hand off to the EXISTING restore / drill ─────────────────────────────
handoffRoot = join(scratch, "handoff");
mkdirSync(handoffRoot, { recursive: true, mode: 0o700 });
const archiveName = manifest.archive || basename(chosen.key);
const runDir = materialiseRunDir({
  rootDir: handoffRoot,
  runId,
  manifest,
  archivePath,
  archiveName,
});

const target = resolve(String(arg("target", `/tmp/r2-restored-${runId}`)));
const command = DRILL
  ? ["bun", ["scripts/restore-drill.mjs", "--out", handoffRoot, "--run", runId, ...(KEEP ? ["--keep"] : [])]]
  : ["bun", ["scripts/restore.mjs", "--out", handoffRoot, "--run", runId, "--target", target]];
log(`handing off to: ${command[0]} ${command[1].join(" ")}`);

const handoff = spawnSync(command[0], command[1], { cwd: REPO, encoding: "utf8", env: process.env, timeout: 300_000 });
const handoffOut = `${handoff.stdout || ""}${handoff.stderr || ""}`.trim();
console.log(handoffOut);

if (handoff.status !== 0) {
  console.error(`[r2-restore] FAILED: the restore path exited ${handoff.status}`);
  cleanup(1);
}

// A drill prints its own JSON report; surface the summary we can vouch for.
let drillReport = null;
if (DRILL) {
  const start = handoffOut.lastIndexOf("\n{");
  try {
    drillReport = JSON.parse(handoffOut.slice(start === -1 ? 0 : start + 1));
  } catch {
    drillReport = null;
  }
}

const summary = {
  ok: true,
  bucketConfigured: true, // the bucket NAME is one of the owner's secrets — never printed
  prefix: cfg.prefix,
  objectKey: chosen.key,
  runId,
  takenAt: manifest.takenAt,
  objectBytes: downloaded,
  listedBytes: chosen.size,
  etag,
  encryption: manifest.encryption,
  decrypt: "ok",
  digestVerification: { ok: true, files: verification.checked, bytes: verification.bytes },
  handoff: {
    mode: DRILL ? "restore-drill.mjs" : "restore.mjs",
    command: `${command[0]} ${command[1].join(" ")}`,
    exit: handoff.status,
  },
  drill: drillReport,
  target: DRILL ? null : target,
  scratchRemoved: !KEEP,
};
console.log(JSON.stringify(summary, null, 2));
cleanup(0);
