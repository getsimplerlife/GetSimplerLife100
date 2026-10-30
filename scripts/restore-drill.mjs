#!/usr/bin/env bun
/**
 * restore-drill.mjs — SLICE 143. The proof: restore a backup run into a scratch
 * directory, boot the REAL server on that directory, and check that what it
 * serves is what we archived.
 *
 *   bun scripts/restore-drill.mjs                 # newest run, port 4198
 *   bun scripts/restore-drill.mjs --run 2026-10-30T20-11-58Z --keep
 *
 * WHAT IT ASSERTS
 *   1. `scripts/restore.mjs` verifies every digest and installs the run into a
 *      scratch dir;
 *   2. the scratch dir's file count and every sha256 match the manifest;
 *   3. a restored JSON store reads back through the app's OWN read path
 *      (src/lib/data-store.ts `readJSON`) with exactly the same keys as the
 *      source, and a restored vault blob byte-compares to its manifest digest;
 *   4. `prod-server.ts` boots on DATA_DIR=<scratch> on PORT 4198 (never 3000 or
 *      3999), reports that data dir through the owner-only /api/admin/datadir,
 *      returns 401 to an unauthenticated caller, and returns real store counts
 *      to an authenticated owner;
 *   5. the server is killed on exit — no orphan listener is left behind.
 *
 * SAFETY: the restored credential store is NEUTRALISED before boot. Booting a
 * second instance against live OAuth credentials would let its refresh loop
 * rotate single-use refresh tokens that the live server still holds (the
 * documented "connection lost" incident class). The credential file's presence
 * and digest are verified first, then it is replaced with `{}` in the scratch
 * copy only — the live data dir is never written by this script.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { connect } from "node:net";
import { existsSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { classifyPath, isManifest, sha256Of, verifyManifestFiles } from "./lib/backup-core.ts";
import { readJSON } from "../src/lib/data-store.ts";

const REPO = resolve(import.meta.dir, "..");
const DEFAULT_OUT = process.env.BACKUP_ROOT?.trim() || "/home/team/shared/backups";
const PORT = Number(argOf("port", "4198"));

function argOf(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : fallback;
}

const OUT_DIR = resolve(argOf("out", DEFAULT_OUT));
const KEEP = process.argv.includes("--keep");
const LIVE_DATA_DIR = resolve(process.env.DATA_DIR?.trim() || "/home/team/shared/site/.data");

function log(msg) {
  console.log(`[drill] ${msg}`);
}

const results = { steps: [], ok: false };

function step(name, ok, detail) {
  results.steps.push({ name, ok, ...(detail === undefined ? {} : { detail }) });
  log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : " — " + JSON.stringify(detail)}`);
  if (!ok) finish(1);
}

function latestRun() {
  let best = null;
  for (const name of readdirSync(OUT_DIR)) {
    try {
      if (!statSync(join(OUT_DIR, name)).isDirectory()) continue;
      if (!existsSync(join(OUT_DIR, name, "manifest.json"))) continue;
      if (!best || name > best) best = name;
    } catch {}
  }
  return best;
}

function portFree(port) {
  return new Promise((res) => {
    const sock = connect({ host: "127.0.0.1", port }, () => {
      sock.destroy();
      res(false);
    });
    sock.on("error", () => res(true));
    sock.setTimeout(1500, () => {
      sock.destroy();
      res(true);
    });
  });
}

function walkCount(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      const sub = walkCount(abs);
      files += sub.files;
      bytes += sub.bytes;
    } else if (st.isFile()) {
      files++;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

let child = null;
let scratchDir = null;
let serverLog = null;

function killServer(signal = "SIGTERM") {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
}

function finish(code) {
  killServer("SIGTERM");
  const done = () => {
    killServer("SIGKILL");
    if (scratchDir && !KEEP) {
      try {
        rmSync(scratchDir, { recursive: true, force: true });
      } catch {}
    }
    results.ok = code === 0;
    console.log(JSON.stringify(results, null, 2));
    process.exit(code);
  };
  if (child && child.exitCode === null) setTimeout(done, 1500);
  else done();
}

process.on("SIGINT", () => finish(1));
process.on("SIGTERM", () => finish(1));
process.on("uncaughtException", (e) => {
  console.error(`[drill] uncaught: ${e?.message || e}`);
  finish(1);
});

// ── 1. Pick a run and restore it ────────────────────────────────────────────
const runArg = argOf("run", null);
const runId = runArg || latestRun();
if (!runId) {
  console.error(`[drill] no backup runs under ${OUT_DIR} — run scripts/backup.mjs first`);
  process.exit(1);
}
const RUN_DIR = join(OUT_DIR, runId);
const manifest = JSON.parse(readFileSync(join(RUN_DIR, "manifest.json"), "utf8"));
if (!isManifest(manifest)) {
  console.error(`[drill] ${RUN_DIR}/manifest.json is not a backup manifest`);
  process.exit(1);
}
log(`run ${runId} (${manifest.takenAt}) — ${manifest.totals.files} files, ${manifest.totals.bytes} bytes`);

scratchDir = `/tmp/restore-drill-${runId}`;
rmSync(scratchDir, { recursive: true, force: true });

const restore = spawnSync("bun", ["scripts/restore.mjs", "--out", OUT_DIR, "--run", runId, "--target", scratchDir], {
  cwd: REPO,
  encoding: "utf8",
  env: process.env,
});
if (restore.status !== 0) {
  console.error(restore.stdout || "");
  console.error(restore.stderr || "");
  step("restore.mjs verified and restored the run", false, { exit: restore.status });
}
step("restore.mjs verified and restored the run", true, { target: scratchDir });

// ── 2. File-level proof against the manifest ────────────────────────────────
const counted = walkCount(scratchDir);
const verified = verifyManifestFiles(scratchDir, manifest);
step("every restored file matches its manifest digest", verified.ok && counted.files === manifest.totals.files, {
  restoredFiles: counted.files,
  manifestFiles: manifest.totals.files,
  restoredBytes: counted.bytes,
  manifestBytes: manifest.totals.bytes,
  mismatches: verified.mismatches.length,
  missing: verified.missing.length,
});

// ── 3. App-path read + a byte-compared vault blob ───────────────────────────
const jsonFiles = manifest.files.filter((f) => classifyPath(f.path) === "json");
const stores = [];
for (const f of jsonFiles) {
  const restored = readJSON(join(scratchDir, f.path));
  const source = readJSON(join(LIVE_DATA_DIR, f.path));
  const keysOf = (v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v).sort() : Array.isArray(v) ? [`[array:${v.length}]`] : []);
  const a = keysOf(restored);
  const b = keysOf(source);
  stores.push({ file: f.path, entries: a.length, sameAsSource: JSON.stringify(a) === JSON.stringify(b) });
}
const storesOk = stores.every((s) => s.sameAsSource);
step("every JSON store reads back through readJSON with the same keys as the source", storesOk, {
  stores: stores.length,
  differing: stores.filter((s) => !s.sameAsSource).map((s) => s.file),
});

const blobs = manifest.files.filter((f) => classifyPath(f.path) === "vaultBlob" || classifyPath(f.path) === "nativeDoc");
if (blobs.length > 0) {
  const blob = blobs[0];
  const restoredHash = sha256Of(readFileSync(join(scratchDir, blob.path)));
  const sourceHash = sha256Of(readFileSync(join(LIVE_DATA_DIR, blob.path)));
  step("a restored vault blob byte-compares to its manifest sha256 and to the source", restoredHash === blob.sha256 && sourceHash === blob.sha256, {
    path: blob.path,
    bytes: blob.bytes,
    sha256: restoredHash,
    blobsChecked: 1,
    blobsInRun: blobs.length,
  });
} else {
  log("no vault blobs in this run — skipping the binary byte comparison");
}

// ── 4. Neutralise credentials, mint a drill owner session, boot ─────────────
const credsFile = join(scratchDir, "tenant_oauth_credentials.json");
if (existsSync(credsFile)) {
  const credsHash = sha256Of(readFileSync(credsFile));
  const credsInManifest = manifest.files.find((f) => f.path === "tenant_oauth_credentials.json");
  const matches = !!credsInManifest && credsInManifest.sha256 === credsHash;
  const credEntries = Object.keys(JSON.parse(readFileSync(credsFile, "utf8")) || {}).length;
  writeFileSync(credsFile, "{}");
  step("credential store verified against the manifest, then neutralised in the scratch copy", matches, {
    verifiedSha256: credsHash,
    credentialEntriesRestored: credEntries,
    note: "neutralised so the drill instance cannot rotate a live single-use refresh token",
  });
}

const users = readJSON(join(scratchDir, "users.json"));
const ownerEmail = Object.keys(users || {}).find((email) => {
  const role = users[email]?.role;
  return role === "admin" || role === "owner";
});
if (!ownerEmail) {
  step("restored users.json contains an owner account", false, { users: Object.keys(users || {}).length });
}
const drillToken = randomBytes(24).toString("hex");
const sessionsFile = join(scratchDir, "sessions.json");
const sessions = readJSON(sessionsFile);
sessions[drillToken] = { email: ownerEmail, createdAt: Date.now() };
writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
step("drill owner session minted in the scratch sessions store", true, {
  sessionsAfter: Object.keys(sessions).length,
  note: "random token, exists only in the scratch dir, deleted with it; never printed",
});

if (!(await portFree(PORT))) {
  step(`port ${PORT} is free before boot`, false, { port: PORT, hint: "another drill/instance is running — retry" });
}

serverLog = `/tmp/restore-drill-${runId}-server.log`;
const out = openSync(serverLog, "w");
child = spawn("bun", ["run", "prod-server.ts"], {
  cwd: REPO,
  detached: true,
  stdio: ["ignore", out, out],
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: scratchDir,
    SKIP_LEGACY_MIGRATION: "1",
    DATABASE_URL: "",
  },
});

let health = null;
const deadline = Date.now() + 45_000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 400));
  if (child.exitCode !== null) break;
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
    if (res.status === 200) {
      health = { status: res.status, body: await res.json() };
      break;
    }
  } catch {}
}
step("/api/health returns 200 on the restored instance", !!health, health ? { status: health.status, body: health.body } : { serverLog: tail(serverLog) });

const bootLog = readFileSync(serverLog, "utf8");
step("the booted server reports DATA_DIR=<scratch>", bootLog.includes(`DATA_DIR=${scratchDir}`), {
  line: (bootLog.split("\n").find((l) => l.includes("DATA_DIR=")) || "").trim(),
});

const anon = await fetch(`http://127.0.0.1:${PORT}/api/admin/datadir`);
step("/api/admin/datadir refuses an unauthenticated caller", anon.status === 401, { status: anon.status });

const authed = await fetch(`http://127.0.0.1:${PORT}/api/admin/datadir`, {
  headers: { cookie: `session=${drillToken}` },
});
const body = authed.status === 200 ? await authed.json() : null;
step("/api/admin/datadir reports the scratch data dir and real store counts to an owner", authed.status === 200 && body?.dataDir === scratchDir, {
  status: authed.status,
  dataDir: body?.dataDir,
  insidePublishTree: body?.insidePublishTree,
  durableStore: body?.durableStore,
  lastBackupAt: body?.lastBackupAt,
  lastBackupOk: body?.lastBackupOk,
  lastBackupFiles: body?.lastBackupFiles,
  stores: Array.isArray(body?.stores) ? body.stores.filter((s) => s.entries > 0 || s.file === "tenant_oauth_credentials.json") : null,
});

results.summary = {
  runId,
  takenAt: manifest.takenAt,
  encryption: manifest.encryption,
  files: manifest.totals.files,
  bytes: manifest.totals.bytes,
  jsonFiles: manifest.totals.jsonFiles,
  vaultBlobs: manifest.totals.vaultBlobs,
  nativeDocs: manifest.totals.nativeDocs,
  otherFiles: manifest.totals.otherFiles,
  port: PORT,
  scratchDir: KEEP ? scratchDir : "(removed after the drill)",
};

// prod-server traps SIGTERM to release the ownership lock and does NOT exit on
// it, so escalate to SIGKILL and then wait for the kernel to actually free the
// socket. A fixed sleep here produced a false "orphan listener" failure.
killServer("SIGTERM");
await new Promise((r) => setTimeout(r, 500));
killServer("SIGKILL");
let stillBound = !(await portFree(PORT));
for (let i = 0; i < 24 && stillBound; i++) {
  await new Promise((r) => setTimeout(r, 250));
  stillBound = !(await portFree(PORT));
}
step(`no orphan listener left on port ${PORT}`, !stillBound, { port: PORT, waitedMs: stillBound ? 6500 : undefined });
finish(0);

function tail(file) {
  try {
    const text = readFileSync(file, "utf8").split("\n").filter(Boolean);
    return text.slice(-12).join("\n");
  } catch {
    return "(no log)";
  }
}
