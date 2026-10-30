#!/usr/bin/env bun
/**
 * loss-drill.mjs — SLICE 146. The drill every earlier drill skipped: restore
 * from an ACTUAL LOSS, not from a healthy dataset.
 *
 * WHY THIS EXISTS (owner directive 2026-10-30: "I don't want any data loss. All
 * clients need their data secured."): slices 143–145 built a verified archive, a
 * restore, an off-box copy to R2 and two passing drills. Every one of those
 * drills restored a dataset that was still intact, so "we can recover" was an
 * ASSUMPTION about the failure path — the one path nobody had walked.
 *
 * WHAT IT PROVES, against a SCRATCH COPY of the data directory (never the live
 * one), each recorded with real output:
 *   1. DELETED STORE   — a populated store file is removed entirely; the restore
 *                        path brings it back from the newest LOCAL archive and
 *                        from the R2 copy, and the bytes match the manifest.
 *   2. CORRUPTED STORE — a store is overwritten with unparseable garbage; the
 *                        app's OWN read path (src/lib/data-store.ts readJSON)
 *                        reports it as a structured corrupt-read error, then a
 *                        restore makes it parse and match its digest again.
 *   3. MISSING BINARY  — a vault blob (customer document bytes) is deleted; the
 *                        restore brings it back byte-identical, local and R2.
 *
 *   bun scripts/loss-drill.mjs                     # newest local archive + R2
 *   bun scripts/loss-drill.mjs --keep              # keep the scratch root
 *   bun scripts/loss-drill.mjs --skip-r2           # local lane only
 *   bun scripts/loss-drill.mjs --data-dir /path/.data --scratch-root /tmp/x
 *
 * GUARDRAILS (each one is a way a "drill" destroys the thing it protects):
 *   - the scratch root may not be, contain, or sit inside the live DATA_DIR;
 *   - the scratch root may not be inside the publish tree (a publish would ship
 *     customer data and the drill would be wiped mid-run);
 *   - EVERY damaging or restoring path is re-checked to be inside the scratch
 *     root at the moment it is used, not just at startup;
 *   - the source data dir is only ever READ (copied), never written;
 *   - the drill refuses to start on a non-empty scratch root — it will not
 *     clobber a directory it did not create;
 *   - the R2 lane writes to its own key prefix (`simplerlife100/drill-<run>/`),
 *     so remote retention can only ever prune drill objects, and the drill
 *     deletes its own objects at the end;
 *   - nothing printed can leak: no store contents, no tokens, no passphrase, no
 *     bucket name, no secret key. Digests, byte counts, relative paths and run
 *     ids only.
 *
 * EXIT: 0 only when every scenario passed. Any failure prints the failure and
 * exits 1 — a drill that did not run must never read as a drill that passed.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { isInsidePublishTree, sha256Of } from "./lib/backup-core.ts";
import { readJSON, resetStoreReadErrorStats, storeReadErrorStats } from "../src/lib/data-store.ts";
import { createR2Client, describeR2Config, r2ConfigFromEnv } from "../src/lib/r2-upload.ts";

const REPO = resolve(import.meta.dir, "..");

// ── args ────────────────────────────────────────────────────────────────────
function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const LIVE_DATA_DIR = resolve((process.env.DATA_DIR || "").trim() || "/home/team/shared/site/.data");
const SOURCE = resolve(String(arg("data-dir", LIVE_DATA_DIR)));
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const SCRATCH = resolve(String(arg("scratch-root", `/tmp/loss-drill-${STAMP}`)));
const KEEP = !!arg("keep", false);
const SKIP_R2 = !!arg("skip-r2", false);
const LOG_PATH = String(arg("log", `/tmp/loss-drill-${STAMP}.log`));
const PASSPHRASE = (process.env.BACKUP_PASSPHRASE || "").trim();
const DRILL_PREFIX = `simplerlife100/drill-loss-${STAMP}/`;

const transcript = [];
/** True only once THIS process created the scratch root — cleanup never removes anything else. */
let scratchCreated = false;
function say(msg) {
  const line = String(msg);
  transcript.push(line);
  console.log(line);
}
function redact(text) {
  let out = String(text ?? "");
  const secrets = [PASSPHRASE, process.env.R2_SECRET_ACCESS_KEY, process.env.R2_ACCESS_KEY_ID, process.env.R2_BUCKET, process.env.R2_ACCOUNT_ID];
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("<redacted>");
  return out;
}
function die(reason) {
  say(`FAILED: ${reason}`);
  finish(1);
}

// ── guardrails ──────────────────────────────────────────────────────────────
function inside(child, parent) {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p + sep);
}
function assertScratchIsSafe() {
  if (!existsSync(SOURCE) || !statSync(SOURCE).isDirectory()) die(`source data dir does not exist: ${SOURCE}`);
  if (SCRATCH === "/" || SCRATCH.length < 8) die(`refusing to use ${SCRATCH} as a scratch root`);
  if (SCRATCH === SOURCE) die(`refusing to run: the scratch root IS the data dir being drilled (${SOURCE})`);
  if (inside(SCRATCH, SOURCE)) die(`refusing to run: the scratch root is inside the data dir being drilled (${SOURCE})`);
  if (inside(SOURCE, SCRATCH)) die(`refusing to run: the data dir being drilled is inside the scratch root`);
  if (isInsidePublishTree(SCRATCH)) die(`refusing to run: the scratch root is inside the publish tree (${SCRATCH})`);
  if (existsSync(SCRATCH) && readdirSync(SCRATCH).length > 0) {
    die(`refusing to run: scratch root ${SCRATCH} exists and is not empty — pass --scratch-root, or remove it yourself`);
  }
  mkdirSync(SCRATCH, { recursive: true, mode: 0o700 });
  chmodSync(SCRATCH, 0o700);
  scratchCreated = true;
}
/** Every damaging or writing path goes through here, at the moment it is used. */
function assertInsideScratch(p, why) {
  if (!inside(p, SCRATCH) || resolve(p) === SCRATCH) die(`refusing to ${why} outside the scratch root: ${p}`);
}

// ── helpers ─────────────────────────────────────────────────────────────────
function rel(p) {
  const abs = resolve(p);
  return inside(abs, SCRATCH) ? abs.slice(SCRATCH.length + 1) || "." : abs;
}
function sh(args, opts = {}) {
  say(`$ ${args.join(" ")}`);
  const res = spawnSync(args[0], args.slice(1), {
    cwd: opts.cwd || REPO,
    encoding: "utf8",
    env: opts.env || process.env,
    timeout: opts.timeout || 300_000,
  });
  const out = redact(`${res.stdout || ""}${res.stderr || ""}`).trim();
  if (out) for (const line of out.split("\n")) say(`  | ${line}`);
  say(`  -> exit ${res.status}`);
  return res;
}
/** The last JSON object printed by a CLI (its machine-readable summary). */
function lastJson(text) {
  const s = String(text || "");
  const i = s.lastIndexOf("\n{");
  if (i === -1) return null;
  try {
    return JSON.parse(s.slice(i + 1));
  } catch {
    return null;
  }
}
function copyTree(src, dst) {
  assertInsideScratch(dst, "create a working copy");
  mkdirSync(dst, { recursive: true, mode: 0o700 });
  for (const name of readdirSync(src)) {
    // Locks are runtime ownership and status is status — the backup excludes
    // them, so a working copy that includes them would not match the archive.
    if (name.endsWith(".lock") || name === "backup_status.json") continue;
    const s = join(src, name);
    const d = join(dst, name);
    const st = statSync(s);
    if (st.isDirectory()) {
      copyTree(s, d);
    } else {
      copyFileSync(s, d);
      chmodSync(d, 0o600);
    }
  }
  return dst;
}
function sha256File(p) {
  return sha256Of(readFileSync(p));
}
function check(cond, message) {
  if (!cond) throw new Error(message);
  say(`  ok: ${message}`);
}

const results = [];
function scenario(name, fn) {
  say("");
  say(`=== SCENARIO ${name} ===`);
  try {
    const detail = fn();
    results.push({ scenario: name, ok: true, detail });
    say(`RESULT ${name}: PASS`);
  } catch (e) {
    results.push({ scenario: name, ok: false, detail: { error: redact(e?.message || String(e)) } });
    say(`RESULT ${name}: FAIL — ${redact(e?.message || String(e))}`);
  }
}

// ── R2 cleanup ──────────────────────────────────────────────────────────────
const r2ObjectsWritten = [];
async function cleanupRemote() {
  if (SKIP_R2 || r2ObjectsWritten.length === 0) return;
  const cfg = r2ConfigFromEnv(process.env);
  if (!cfg) return;
  try {
    const client = createR2Client({ config: cfg, log: () => {} });
    const objects = await client.listObjects(DRILL_PREFIX);
    for (const o of objects) {
      await client.deleteObject(o.key);
      say(`[r2] removed drill object ${o.key}`);
    }
    say(`[r2] drill prefix ${DRILL_PREFIX} cleaned (${objects.length} object(s) removed)`);
  } catch (e) {
    say(`[r2] WARNING: could not clean the drill prefix — ${redact(e?.message || e)}`);
  }
}

function finish(code) {
  if (!KEEP && scratchCreated) {
    try {
      rmSync(SCRATCH, { recursive: true, force: true });
      say(`scratch root removed: ${SCRATCH}`);
    } catch (e) {
      say(`WARNING: could not remove the scratch root ${SCRATCH} — ${redact(e?.message || e)}`);
    }
  } else if (!scratchCreated) {
    // A refused run must never delete a directory it did not create.
    say(`nothing to clean: this run never created a scratch root`);
  } else {
    say(`--keep: scratch root kept at ${SCRATCH}`);
  }
  const summary = {
    ok: code === 0,
    ranAt: new Date().toISOString(),
    source: SOURCE,
    scratchRoot: KEEP ? SCRATCH : "(removed)",
    backupRoot: KEEP ? BACKUP_OUT : "(removed)",
    runId: RUN_ID,
    drillPrefix: SKIP_R2 ? "(r2 lane skipped)" : DRILL_PREFIX,
    scenarios: results,
  };
  say("");
  say("=== SUMMARY ===");
  say(JSON.stringify(summary, null, 2));
  try {
    writeFileSync(LOG_PATH, transcript.join("\n") + "\n", { mode: 0o600 });
    console.log(`transcript: ${LOG_PATH}`);
  } catch (e) {
    console.log(`could not write transcript: ${e?.message || e}`);
  }
  process.exit(code);
}

// ── preconditions ───────────────────────────────────────────────────────────
let RUN_ID = null;
let BACKUP_OUT = null;
let MANIFEST = null;

async function main() {
  say(`[loss-drill] source data dir : ${SOURCE}`);
  say(`[loss-drill] scratch root   : ${SCRATCH}`);
  say(`[loss-drill] git head       : ${(spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, encoding: "utf8" }).stdout || "").trim()}`);
  say(`[loss-drill] r2 lane        : ${SKIP_R2 ? "SKIPPED (--skip-r2)" : "enabled"}`);
  if (!PASSPHRASE) die("BACKUP_PASSPHRASE is not set — the R2 lane and the encrypted archive both need it");
  assertScratchIsSafe();

  BACKUP_OUT = join(SCRATCH, "backups");
  assertInsideScratch(BACKUP_OUT, "create the backup root");

  // ── baseline: an untouched copy of the real data dir ──────────────────────
  say("");
  say("=== BASELINE: copy the real data dir into scratch (read-only on the source) ===");
  const baseline = copyTree(SOURCE, join(SCRATCH, "baseline"));
  let fileCount = 0;
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else fileCount++;
    }
  };
  walk(baseline);
  say(`copied ${fileCount} file(s) into ${rel(baseline)}`);

  // ── one encrypted archive of the baseline, local + R2 ─────────────────────
  say("");
  say("=== ARCHIVE: one verified, encrypted run of the baseline (local + R2) ===");
  const backupEnv = { ...process.env, R2_PREFIX: DRILL_PREFIX };
  const backupArgs = ["bun", "scripts/backup.mjs", "--data-dir", baseline, "--out", BACKUP_OUT];
  if (SKIP_R2) backupArgs.push("--no-upload");
  const backupRes = sh(backupArgs, { env: backupEnv });
  if (backupRes.status !== 0) die("the baseline backup run failed — nothing to restore from");
  const backupReport = lastJson(backupRes.stdout);
  if (!backupReport?.runId) die("could not read the run id out of the backup output");
  RUN_ID = backupReport.runId;
  say(`run id ${RUN_ID}; encryption ${backupReport.encryption}; files ${backupReport.files}; bytes ${backupReport.bytes}`);
  if (backupReport.encryption === "off" || !backupReport.encryption) die("the baseline run is not encrypted — refusing to drill against plaintext");
  if (!SKIP_R2) {
    if (!backupReport.r2?.uploaded) {
      say(`WARNING: the R2 leg did not upload (${backupReport.r2?.uploadSkipped || backupReport.r2?.error || "unknown"}) — the R2 restores below will fail, and will be recorded as failures`);
    } else {
      r2ObjectsWritten.push(backupReport.r2.key);
    }
  }

  const manifestPath = join(BACKUP_OUT, RUN_ID, "manifest.json");
  assertInsideScratch(manifestPath, "read the manifest");
  MANIFEST = JSON.parse(readFileSync(manifestPath, "utf8"));
  const digestOf = (p) => MANIFEST.files.find((f) => f.path === p);
  say(`manifest: ${MANIFEST.files.length} files, ${MANIFEST.totals.bytes} bytes, archive ${MANIFEST.archive}`);

  // ── SCENARIO 1 — deleted store ────────────────────────────────────────────
  scenario("1 DELETED STORE (local archive + R2 copy)", () => {
    const work = copyTree(baseline, join(SCRATCH, "s1-data"));
    const store =
      ["tenant_approvals.json", "tenant_audit_logs.json", "users.json"].find((n) => {
        const p = join(work, n);
        return existsSync(p) && statSync(p).size > 2 && digestOf(n);
      }) || MANIFEST.files.find((f) => f.path.endsWith(".json") && f.bytes > 2)?.path;
    if (!store) throw new Error("no populated JSON store in the archive to delete");
    const victim = join(work, store);
    assertInsideScratch(victim, "delete a store");
    const expected = digestOf(store);
    if (!expected) throw new Error(`${store} is not in the manifest`);
    check(sha256File(victim) === expected.sha256, `${store} starts out matching its manifest digest (${expected.bytes} bytes)`);
    const original = readFileSync(victim);

    rmSync(victim);
    check(!existsSync(victim), `${store} is now GONE from the working copy (simulated loss)`);

    // lane A — newest local archive
    const localTarget = join(SCRATCH, "s1-restored-local");
    assertInsideScratch(localTarget, "restore into");
    const localRes = sh(["bun", "scripts/restore.mjs", "--out", BACKUP_OUT, "--run", RUN_ID, "--target", localTarget]);
    check(localRes.status === 0, "restore.mjs exited 0");
    const backLocal = join(localTarget, store);
    check(existsSync(backLocal), `${store} is back after the local restore`);
    check(sha256File(backLocal) === expected.sha256, `restored ${store} matches the manifest digest`);
    check(readFileSync(backLocal).equals(original), "restored bytes are identical to the pre-loss bytes");

    // lane B — the R2 copy
    if (SKIP_R2) {
      say("  --skip-r2: R2 lane not exercised");
      return { store, bytes: expected.bytes, sha256: expected.sha256, r2: "skipped" };
    }
    const r2Target = join(SCRATCH, "s1-restored-r2");
    assertInsideScratch(r2Target, "restore into");
    const r2Res = sh(["bun", "scripts/restore-from-r2.mjs", "--run", RUN_ID, "--target", r2Target], { env: { ...process.env, R2_PREFIX: DRILL_PREFIX } });
    check(r2Res.status === 0, "restore-from-r2.mjs exited 0");
    const backR2 = join(r2Target, store);
    check(existsSync(backR2), `${store} is back after the R2 restore`);
    check(sha256File(backR2) === expected.sha256, `R2-restored ${store} matches the manifest digest`);
    check(readFileSync(backR2).equals(original), "R2-restored bytes are identical to the pre-loss bytes");
    return { store, bytes: expected.bytes, sha256: expected.sha256, r2: "restored and byte-identical" };
  });

  // ── SCENARIO 2 — corrupted store ──────────────────────────────────────────
  scenario("2 CORRUPTED STORE (app read path reports it, restore heals it)", () => {
    const work = copyTree(baseline, join(SCRATCH, "s2-data"));
    const store =
      ["tenant_audit_logs.json", "users.json", "tenant_approvals.json"].find((n) => {
        const p = join(work, n);
        return existsSync(p) && statSync(p).size > 2 && digestOf(n);
      }) || null;
    if (!store) throw new Error("no populated JSON store in the archive to corrupt");
    const victim = join(work, store);
    assertInsideScratch(victim, "corrupt a store");
    const expected = digestOf(store);
    const original = readFileSync(victim);

    // A torn write: a truncated object that can never parse.
    writeFileSync(victim, original.subarray(0, Math.max(1, Math.floor(original.length / 2))));
    check(sha256File(victim) !== expected.sha256, `${store} no longer matches its digest (corrupted on disk)`);

    // The APP's own read path — not a JSON.parse written for the drill.
    resetStoreReadErrorStats();
    const captured = [];
    const realError = console.error;
    const realLog = console.log;
    const grab = (...a) => captured.push(a.map(String).join(" "));
    console.error = grab;
    console.log = grab;
    let value;
    try {
      value = readJSON(victim);
    } finally {
      console.error = realError;
      console.log = realLog;
    }
    for (const line of captured) say(`  app said: ${redact(line)}`);
    const stats = storeReadErrorStats();
    say(`  app read path: value=${JSON.stringify(value)} corruptReadCount=${stats.count} file=${rel(stats.last?.file || "")} error=${JSON.stringify(stats.last?.error || "")}`);
    check(stats.count === 1, "the app counted exactly one corrupt read (slice 144 counter)");
    check(resolve(stats.last?.file || "") === resolve(victim), "the corrupt-read record names the corrupted file");
    check(!!stats.last?.error, "the corrupt-read record carries the parse error");
    const structured = captured.some((l) => l.includes('"event":"store_parse_error"') && l.includes('"severity":"error"'));
    check(structured, 'the app emitted the structured log line {"event":"store_parse_error"}');
    check(JSON.stringify(value) === "{}", "the app still answers {} (the historical fallback) — which is exactly why the log matters");

    // Heal it: restore over the damaged directory, as a real recovery would.
    assertInsideScratch(work, "restore over");
    const healRes = sh(["bun", "scripts/restore.mjs", "--out", BACKUP_OUT, "--run", RUN_ID, "--target", work, "--force"]);
    check(healRes.status === 0, "restore.mjs exited 0 restoring over the damaged dir");
    check(existsSync(victim), `${store} exists again`);
    check(sha256File(victim) === expected.sha256, `${store} matches its manifest digest again`);
    let parsed = null;
    let parseErr = null;
    try {
      parsed = JSON.parse(readFileSync(victim, "utf8"));
    } catch (e) {
      parseErr = e?.message || String(e);
    }
    check(parseErr === null, `restored store parses again${parseErr ? ` (JSON.parse threw: ${parseErr})` : ""}`);
    check(parsed !== null && typeof parsed === "object", "the restored store is a real object, not an empty fallback");
    check(readFileSync(victim).equals(original), "restored bytes are identical to the pre-corruption bytes");

    if (SKIP_R2) return { store, sha256: expected.sha256, r2: "skipped" };
    const r2Target = join(SCRATCH, "s2-restored-r2");
    assertInsideScratch(r2Target, "restore into");
    const r2Res = sh(["bun", "scripts/restore-from-r2.mjs", "--run", RUN_ID, "--target", r2Target], { env: { ...process.env, R2_PREFIX: DRILL_PREFIX } });
    check(r2Res.status === 0, "restore-from-r2.mjs exited 0");
    check(sha256File(join(r2Target, store)) === expected.sha256, `R2-restored ${store} matches the manifest digest`);
    return { store, sha256: expected.sha256, r2: "restored" };
  });

  // ── SCENARIO 3 — missing binary ───────────────────────────────────────────
  scenario("3 MISSING BINARY (vault blob / document bytes, local + R2)", () => {
    const work = copyTree(baseline, join(SCRATCH, "s3-data"));
    const blob = MANIFEST.files.find((f) => f.path.startsWith("vault/blobs/") || f.path.startsWith("native_docs/"));
    if (!blob) throw new Error("the archive holds no vault blob or document bytes to delete");
    const victim = join(work, blob.path);
    assertInsideScratch(victim, "delete a binary");
    check(existsSync(victim), `target binary is present: ${blob.path} (${blob.bytes} bytes)`);
    check(sha256File(victim) === blob.sha256, "binary starts out matching its manifest digest");
    const original = readFileSync(victim);

    rmSync(victim);
    check(!existsSync(victim), `${blob.path} is now GONE (simulated loss of customer bytes)`);

    const localTarget = join(SCRATCH, "s3-restored-local");
    assertInsideScratch(localTarget, "restore into");
    const localRes = sh(["bun", "scripts/restore.mjs", "--out", BACKUP_OUT, "--run", RUN_ID, "--target", localTarget]);
    check(localRes.status === 0, "restore.mjs exited 0");
    const back = join(localTarget, blob.path);
    check(existsSync(back), `${blob.path} is back after the local restore`);
    check(sha256File(back) === blob.sha256, "restored binary matches the manifest digest");
    check(readFileSync(back).equals(original), "restored binary is byte-identical (Buffer.equals)");

    if (SKIP_R2) return { path: blob.path, bytes: blob.bytes, sha256: blob.sha256, r2: "skipped" };
    const r2Target = join(SCRATCH, "s3-restored-r2");
    assertInsideScratch(r2Target, "restore into");
    const r2Res = sh(["bun", "scripts/restore-from-r2.mjs", "--run", RUN_ID, "--target", r2Target], { env: { ...process.env, R2_PREFIX: DRILL_PREFIX } });
    check(r2Res.status === 0, "restore-from-r2.mjs exited 0");
    const backR2 = join(r2Target, blob.path);
    check(existsSync(backR2), `${blob.path} is back after the R2 restore`);
    check(sha256File(backR2) === blob.sha256, "R2-restored binary matches the manifest digest");
    check(readFileSync(backR2).equals(original), "R2-restored binary is byte-identical");
    return { path: blob.path, bytes: blob.bytes, sha256: blob.sha256, r2: "restored and byte-identical" };
  });

  // ── cleanup + verdict ─────────────────────────────────────────────────────
  say("");
  say("=== CLEANUP ===");
  await cleanupRemote();
  const failed = results.filter((r) => !r.ok);
  finish(failed.length === 0 ? 0 : 1);
}

main().catch(async (e) => {
  say(`FAILED: ${redact(e?.message || e)}`);
  await cleanupRemote();
  finish(1);
});
