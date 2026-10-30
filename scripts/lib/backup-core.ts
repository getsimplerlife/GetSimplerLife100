/**
 * backup-core.ts — the testable core of slice 143 (backup + restore drill).
 *
 * WHY THIS FILE EXISTS (owner directive 2026-10-30: "make sure we never lose
 * anything"): until this slice the business had no copy of its runtime data that
 * survives anything and no restore code at all. `durableSnapshotBackup()`
 * writes JSON into the same database it is meant to protect, skips vault blobs
 * and native_docs PDFs entirely, and has no restore path — it is a snapshot, not
 * a backup, and nothing here builds on it.
 *
 * The three CLIs (`scripts/backup.mjs`, `scripts/restore.mjs`,
 * `scripts/restore-drill.mjs`) are thin wrappers over these functions so that
 * every safety rule below is unit-tested instead of only hoped for.
 *
 * HARD TRUTH THIS CODE DEFENDS AGAINST:
 *   - Every durable write used to be a plain whole-document `writeFileSync`
 *     with no temp+rename anywhere in src/ (SLICE 144 replaced that with
 *     src/lib/atomic-write.ts: temp file → fsync → rename → dir fsync), and
 *     `readJSON` answers an unparseable file with `{}`. A file copied mid-write
 *     can therefore still be TORN by an older process or a non-atomic writer,
 *     and a torn file reads back as an EMPTY STORE. A backup taken over a live
 *     server must prove each file was stable and re-parses, or fail loudly
 *     rather than produce a silent empty store.
 *   - Restoring `prod-server.lock` / `liveness-watchdog.lock` makes a fresh
 *     instance refuse to boot (src/lib/single-instance.ts), so locks are never
 *     archived and never restored.
 *   - A run that silently misses a store is worse than no run at all, so every
 *     run asserts COVERAGE against `DURABLE_STORES` (src/lib/durable-stores.ts)
 *     and fails when a declared store holds data that did not enter the archive.
 *   - The archive is SAME-HOST. It is not off-box and must never be described
 *     as off-box, DR-grade, or "backups" in public copy.
 */
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, posix } from "node:path";
import { atomicWriteSync } from "../../src/lib/atomic-write";
import { DURABLE_BINARY_STORES, DURABLE_STORES } from "../../src/lib/durable-stores";

/** Lock files that must never enter an archive (they are runtime ownership). */
export const LOCK_FILES: readonly string[] = ["prod-server.lock", "liveness-watchdog.lock"];

/** Operational status file written into DATA_DIR for /api/admin/datadir. */
export const BACKUP_STATUS_FILE = "backup_status.json";

/** Directories whose non-JSON binary payloads are the ones we must not lose. */
export const BINARY_TREES: readonly string[] = ["vault/blobs", "native_docs"];

export type Encryption = "off" | "openssl-aes-256-cbc";

export interface ManifestFile {
  /** Path relative to DATA_DIR, POSIX separators. */
  path: string;
  bytes: number;
  sha256: string;
}

export interface ManifestTotals {
  files: number;
  bytes: number;
  jsonFiles: number;
  vaultBlobs: number;
  nativeDocs: number;
  otherFiles: number;
}

export interface ManifestSource {
  host: string;
  dataDir: string;
  gitSha: string;
  durableEnabled: boolean;
}

export interface Manifest {
  runId: string;
  takenAt: string;
  source: ManifestSource;
  files: ManifestFile[];
  totals: ManifestTotals;
  /** Paths deliberately left out of the archive, with the reason. */
  excluded: string[];
  /** SLICE 144: one row per declared durable store — proof of COVERAGE. */
  coverage: CoverageRow[];
  encryption: Encryption;
  /** Archive file name inside the run directory, or null for a plain tree. */
  archive: string | null;
  tool: string;
}

export interface BackupStatus {
  lastBackupAt: string | null;
  lastBackupOk: boolean | null;
  lastBackupBytes: number | null;
  lastBackupTarget: string | null;
  lastBackupError: string | null;
  runId?: string | null;
  files?: number | null;
  encryption?: Encryption | null;
}

export class TornReadError extends Error {
  constructor(public readonly relPath: string, public readonly detail: string) {
    super(`torn/unstable read of ${relPath}: ${detail}`);
    this.name = "TornReadError";
  }
}

export function sha256Of(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function statSignature(absPath: string): string {
  const st = statSync(absPath);
  return `${st.size}:${st.mtimeMs}:${st.ino}`;
}

export interface StableReadResult {
  buffer: Buffer;
  sha256: string;
  bytes: number;
  attempts: number;
}

/**
 * Read a file twice and accept it ONLY when both reads are byte-identical and
 * the inode/size/mtime did not move between them. This is the torn-write
 * defence: a whole-document `writeFileSync` in flight produces either a short
 * file or two different digests, and both are rejected.
 */
export function stableRead(
  absPath: string,
  opts: { attempts?: number; sleepMs?: number; readFile?: (p: string) => Buffer } = {},
): StableReadResult {
  const attempts = opts.attempts ?? 5;
  const sleepMs = opts.sleepMs ?? 60;
  const readFile = opts.readFile ?? ((p: string) => readFileSync(p));
  let lastDetail = "no attempt made";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const before = statSignature(absPath);
      const first = readFile(absPath);
      const second = readFile(absPath);
      const after = statSignature(absPath);
      const firstHash = sha256Of(first);
      const secondHash = sha256Of(second);
      if (before !== after) {
        lastDetail = `stat changed during read (${before} -> ${after})`;
      } else if (firstHash !== secondHash) {
        lastDetail = `two reads disagree (${firstHash.slice(0, 12)} vs ${secondHash.slice(0, 12)})`;
      } else if (first.length !== second.length) {
        lastDetail = `two reads differ in length (${first.length} vs ${second.length})`;
      } else {
        return { buffer: first, sha256: firstHash, bytes: first.length, attempts: attempt };
      }
    } catch (e: any) {
      lastDetail = e?.message || String(e);
    }
    if (attempt < attempts && sleepMs > 0) sleepSync(sleepMs);
  }
  throw new TornReadError(absPath, lastDetail);
}

function sleepSync(ms: number): void {
  const end = Date.now() + ms;
  // Busy-wait: these are millisecond waits inside a CLI, and it keeps the core
  // usable from a synchronous test without dragging in timers.
  while (Date.now() < end) {
    /* spin */
  }
}

function walkFiles(root: string, rel: string, out: string[]): void {
  const abs = rel ? join(root, rel) : root;
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return;
  }
  for (const name of entries.sort()) {
    const childRel = rel ? posix.join(rel, name) : name;
    const childAbs = join(root, childRel);
    let st;
    try {
      st = statSync(childAbs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(root, childRel, out);
    else if (st.isFile()) out.push(childRel);
  }
}

/**
 * Decide what goes into the archive.
 *
 * Every regular file under DATA_DIR is included — the owner's requirement is
 * "never lose anything", and a whitelist of `*.json` + two directories would
 * silently drop anything new the app starts writing. The only exclusions are
 * the two ownership locks (restoring them is a boot trap) and the operational
 * `backup_status.json` (rewritten by every run; it is status, not data).
 */
export function collectBackupFiles(dataDir: string): { include: string[]; excluded: string[] } {
  const all: string[] = [];
  walkFiles(dataDir, "", all);
  const include: string[] = [];
  const excluded: string[] = [];
  for (const rel of all) {
    const base = rel.split("/").pop() || rel;
    if (LOCK_FILES.includes(base)) {
      excluded.push(`${rel} (runtime ownership lock — restoring it blocks boot)`);
      continue;
    }
    if (rel === BACKUP_STATUS_FILE) {
      excluded.push(`${rel} (operational status of this backup, rewritten every run)`);
      continue;
    }
    include.push(rel);
  }
  return { include, excluded };
}

export function classifyPath(rel: string): "json" | "vaultBlob" | "nativeDoc" | "other" {
  if (rel.endsWith(".json")) return "json";
  for (const tree of BINARY_TREES) {
    if (rel.startsWith(tree + "/")) {
      return tree === "vault/blobs" ? "vaultBlob" : "nativeDoc";
    }
  }
  return "other";
}

export interface CollectResult {
  files: ManifestFile[];
  excluded: string[];
  totals: ManifestTotals;
}

/**
 * Read every selected file with the torn-write defence and require every
 * `*.json` to re-parse. Any instability or unparseable JSON throws — a run that
 * cannot produce a clean copy must fail, never report success.
 */
export function collectVerifiedFiles(
  dataDir: string,
  opts: { sleepMs?: number; attempts?: number } = {},
): CollectResult {
  const { include, excluded } = collectBackupFiles(dataDir);
  const files: ManifestFile[] = [];
  const totals: ManifestTotals = {
    files: 0,
    bytes: 0,
    jsonFiles: 0,
    vaultBlobs: 0,
    nativeDocs: 0,
    otherFiles: 0,
  };
  for (const rel of include) {
    const read = stableRead(join(dataDir, rel), { sleepMs: opts.sleepMs, attempts: opts.attempts });
    const kind = classifyPath(rel);
    if (kind === "json") {
      try {
        JSON.parse(read.buffer.toString("utf8"));
      } catch (e: any) {
        throw new Error(`unparseable JSON in ${rel}: ${e?.message || String(e)} — refusing to archive a torn store`);
      }
      totals.jsonFiles++;
    } else if (kind === "vaultBlob") totals.vaultBlobs++;
    else if (kind === "nativeDoc") totals.nativeDocs++;
    else totals.otherFiles++;
    files.push({ path: rel, bytes: read.bytes, sha256: read.sha256 });
    totals.files++;
    totals.bytes += read.bytes;
  }
  return { files, excluded, totals };
}

export function buildManifest(input: {
  runId: string;
  takenAt: string;
  source: ManifestSource;
  files: ManifestFile[];
  totals: ManifestTotals;
  excluded: string[];
  encryption: Encryption;
  archive: string | null;
  coverage?: CoverageRow[];
}): Manifest {
  return {
    runId: input.runId,
    takenAt: input.takenAt,
    source: input.source,
    files: input.files,
    totals: input.totals,
    excluded: input.excluded,
    coverage: input.coverage ?? [],
    encryption: input.encryption,
    archive: input.archive,
    tool: "scripts/backup.mjs",
  };
}

/** A run id is a UTC timestamp: 2026-10-30T20-11-58Z */
export function runIdFor(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

export function parseRunId(runId: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/.exec(runId);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** ISO-week key (UTC) used for the weekly retention bucket. */
export function weekKeyOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Retention: keep the newest run for each of the last `daily` calendar days
 * (UTC), then the newest run for each of the last `weekly` ISO weeks that the
 * daily set did not already cover. Everything else is pruned. Unknown run ids
 * are always pruned last, never kept by accident.
 */
export function planRetention(
  runIds: string[],
  opts: { daily?: number; weekly?: number } = {},
): { keep: string[]; prune: string[] } {
  const daily = opts.daily ?? 7;
  const weekly = opts.weekly ?? 4;
  const parsed: Array<{ runId: string; at: Date }> = [];
  const unknown: string[] = [];
  for (const runId of runIds) {
    const at = parseRunId(runId);
    if (at) parsed.push({ runId, at });
    else unknown.push(runId);
  }
  parsed.sort((a, b) => b.at.getTime() - a.at.getTime());

  const keep = new Set<string>();
  const days = new Set<string>();
  for (const { runId, at } of parsed) {
    if (days.size >= daily) break;
    const day = at.toISOString().slice(0, 10);
    if (days.has(day)) continue;
    days.add(day);
    keep.add(runId);
  }
  // Weekly slots only cover weeks that the daily set did not already cover —
  // otherwise an older run from an already-kept week would claim a weekly slot
  // and push out a genuinely older week.
  const weeks = new Set<string>();
  for (const { runId, at } of parsed) if (keep.has(runId)) weeks.add(weekKeyOf(at));
  let weeklyAdded = 0;
  for (const { runId, at } of parsed) {
    if (weeklyAdded >= weekly) break;
    if (keep.has(runId)) continue;
    const wk = weekKeyOf(at);
    if (weeks.has(wk)) continue;
    weeks.add(wk);
    keep.add(runId);
    weeklyAdded++;
  }
  return {
    keep: [...keep],
    prune: [...parsed.map((p) => p.runId).filter((id) => !keep.has(id)), ...unknown],
  };
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  bytes: number;
  mismatches: Array<{ path: string; expected: string; actual: string }>;
  missing: string[];
}

/** Verify every manifest digest against the files in `rootDir`. */
export function verifyManifestFiles(rootDir: string, manifest: Manifest): VerifyResult {
  const mismatches: Array<{ path: string; expected: string; actual: string }> = [];
  const missing: string[] = [];
  let bytes = 0;
  for (const f of manifest.files) {
    const abs = join(rootDir, f.path);
    if (!existsSync(abs)) {
      missing.push(f.path);
      continue;
    }
    const actual = sha256Of(readFileSync(abs));
    bytes += readFileSync(abs).length;
    if (actual !== f.sha256) mismatches.push({ path: f.path, expected: f.sha256, actual });
  }
  return { ok: mismatches.length === 0 && missing.length === 0, checked: manifest.files.length, bytes, mismatches, missing };
}

/** True when a manifest looks like one of ours (never trust a foreign JSON). */
export function isManifest(value: any): value is Manifest {
  return (
    !!value &&
    typeof value === "object" &&
    typeof value.runId === "string" &&
    Array.isArray(value.files) &&
    value.files.every((f: any) => f && typeof f.path === "string" && typeof f.sha256 === "string" && typeof f.bytes === "number")
  );
}

export function statusFor(
  manifest: Manifest,
  target: string,
  error: string | null = null,
): BackupStatus {
  return {
    lastBackupAt: manifest.takenAt,
    lastBackupOk: error === null,
    lastBackupBytes: manifest.totals.bytes,
    lastBackupTarget: target,
    lastBackupError: error,
    runId: manifest.runId,
    files: manifest.totals.files,
    encryption: manifest.encryption,
  };
}

export function failedStatus(at: string, target: string, error: string): BackupStatus {
  return {
    lastBackupAt: at,
    lastBackupOk: false,
    lastBackupBytes: null,
    lastBackupTarget: target,
    lastBackupError: error,
    runId: null,
    files: null,
    encryption: null,
  };
}

/** Persist the run status atomically (mode 600) so a torn status reads as nulls. */
export function writeBackupStatus(dataDir: string, status: BackupStatus): void {
  const file = join(dataDir, BACKUP_STATUS_FILE);
  atomicWriteSync(file, JSON.stringify(status, null, 2));
  try {
    chmodSync(file, 0o600);
  } catch {
    /* atomicWriteSync already used 600 for a new file / kept the old mode */
  }
}

// ── SLICE 144 — COVERAGE: prove the archive contains every store we hold ─────

/** One row of the coverage table reported in the manifest. */
export interface CoverageRow {
  /** Store path relative to DATA_DIR (a file, or a directory tree). */
  store: string;
  presentOnDisk: boolean;
  includedInArchive: boolean;
  /** Bytes on disk for this store right now (0 when absent). */
  bytes: number;
}

function bytesUnder(absDir: string): number {
  let total = 0;
  let entries: string[];
  try {
    entries = readdirSync(absDir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    const abs = join(absDir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) total += bytesUnder(abs);
    else if (st.isFile()) total += st.size;
  }
  return total;
}

/**
 * Coverage row for ONE declared store.
 *
 * `presentOnDisk` and `bytes` are measured on the live data dir; `included` is
 * measured against the paths the archive actually selected, so the row is a
 * comparison of two real things rather than a restatement of intent.
 */
export function coverageRowFor(
  dataDir: string,
  store: string,
  includedPaths: readonly string[],
): CoverageRow {
  const abs = join(dataDir, store);
  let presentOnDisk = false;
  let bytes = 0;
  try {
    const st = statSync(abs);
    presentOnDisk = true;
    bytes = st.isDirectory() ? bytesUnder(abs) : st.size;
  } catch {
    presentOnDisk = false;
    bytes = 0;
  }
  const isDir = DURABLE_BINARY_STORES.includes(store);
  const includedInArchive = isDir
    ? includedPaths.some((p) => p === store || p.startsWith(store + "/"))
    : includedPaths.includes(store);
  return { store, presentOnDisk, includedInArchive, bytes };
}

export interface CoverageReport {
  rows: CoverageRow[];
  /** Declared stores that HOLD DATA but did not enter the archive. */
  uncovered: CoverageRow[];
  ok: boolean;
}

/**
 * THE COVERAGE ASSERTION.
 *
 * A store that is absent from disk has nothing to lose, so it is not a failure.
 * A store that is present but EMPTY has nothing to lose either. A store that
 * holds bytes and is NOT in the archive is silent data loss dressed up as
 * protection — that fails the run.
 */
export function checkCoverage(
  dataDir: string,
  includedPaths: readonly string[],
  declared: readonly string[] = DURABLE_STORES,
): CoverageReport {
  const rows = declared.map((store) => coverageRowFor(dataDir, store, includedPaths));
  const uncovered = rows.filter((r) => r.presentOnDisk && r.bytes > 0 && !r.includedInArchive);
  return { rows, uncovered, ok: uncovered.length === 0 };
}

export function coverageFailureMessage(report: CoverageReport): string {
  const list = report.uncovered.map((r) => `${r.store} (${r.bytes} bytes)`).join(", ");
  return `coverage assertion failed: ${report.uncovered.length} declared store(s) hold data but are not in the archive: ${list}`;
}

// ── SLICE 144 — mechanical derivation of the declared-store list ────────────

/**
 * Re-derive the store list from a SOURCE TREE (not from DURABLE_STORES), so a
 * test can prove the single list in src/lib/durable-stores.ts is complete.
 *
 * Sources: `_KEY` constants in `src/native/<app>/types.ts`, store-path constants
 * and `join(<dataDir>, "<name>.json")` in `src/lib` + `src/verification`, and
 * `join(DATA_DIR, "<name>.json")` in prod-server.ts. The three binary trees are
 * derived from the modules that write them.
 *
 * Deliberately excluded: `backup_status.json` (operational status, never
 * archived) and the runtime ownership locks (restoring one blocks boot).
 */
export function deriveDeclaredStores(rootDir: string): string[] {
  const found = new Set<string>();
  const read = (p: string): string => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return "";
    }
  };
  const add = (name: string): void => {
    // Skip doc-comment placeholders such as "<name>.json" — only real names.
    if (name.includes("<") || name.includes(">")) return;
    if (name.endsWith(".json") && name !== BACKUP_STATUS_FILE) found.add(name);
  };
  const scan = (text: string): void => {
    for (const m of text.matchAll(/export const\s+\w*_KEY\w*\s*=\s*"([^"]+\.json)"/g)) add(m[1]);
    for (const m of text.matchAll(/export const\s+\w*(?:_FILE|_STORE)\w*\s*=\s*"([^"]+\.json)"/g)) add(m[1]);
    for (const m of text.matchAll(/join\(\s*(?:dataDir|DATA_DIR|this\.dataDir)\s*,\s*"([^"]+\.json)"/g)) add(m[1]);
    for (const m of text.matchAll(/"?\.data"?\s*,\s*"([^"]+\.json)"/g)) add(m[1]);
  };

  let apps: string[] = [];
  try {
    apps = readdirSync(join(rootDir, "src", "native"));
  } catch {
    apps = [];
  }
  for (const app of apps) {
    const typesFile = join(rootDir, "src", "native", app, "types.ts");
    if (existsSync(typesFile)) scan(read(typesFile));
  }
  for (const sub of ["src/lib", "src/verification"]) {
    let files: string[] = [];
    try {
      files = readdirSync(join(rootDir, sub));
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.endsWith(".ts")) scan(read(join(rootDir, sub, f)));
    }
  }
  scan(read(join(rootDir, "prod-server.ts")));

  // Binary trees, derived from the writers themselves.
  const docStore = read(join(rootDir, "src/native/documents/store.ts"));
  if (/"native_docs"/.test(docStore)) found.add("native_docs");
  const formStore = read(join(rootDir, "src/native/forms/store.ts"));
  if (/"native_forms"/.test(formStore)) found.add("native_forms");
  const vaultStore = read(join(rootDir, "src/lib/vault-store.ts"));
  if (/"blobs"/.test(vaultStore)) found.add("vault/blobs");

  return [...found].sort();
}

// ── SLICE 144 — one in-process run of the whole pipeline ────────────────────

export interface RunBackupOptions {
  dataDir: string;
  outDir: string;
  keepDaily?: number;
  keepWeekly?: number;
  noPrune?: boolean;
  noStatus?: boolean;
  /** Override the declared-store list (tests prove an uncovered store fails). */
  declaredStores?: readonly string[];
  now?: Date;
  host?: string;
  gitSha?: string;
  durableEnabled?: boolean;
  log?: (msg: string) => void;
  /** CLI-only hook: encrypt the staged run dir and drop the plaintext copy. */
  encrypt?: (runDir: string, manifest: Manifest) => void;
}

export interface RunBackupResult {
  runId: string;
  target: string;
  files: number;
  bytes: number;
  pruned: Array<{ runId: string; bytes: number }>;
  coverage: CoverageRow[];
  manifest: Manifest;
}

/**
 * The whole backup pipeline, in process: pre-flight guards → verified collect →
 * coverage assertion → staged copy with digest re-check → manifest → optional
 * encryption → retention → status file.
 *
 * Used by `scripts/backup.mjs` AND by the in-server scheduler
 * (src/lib/backup-scheduler.ts), so there is exactly one implementation of the
 * rules above. THROWS on any failure after recording a failed status; a caller
 * that catches the error must never report success.
 */
export function runBackup(opts: RunBackupOptions): RunBackupResult {
  const log = opts.log ?? (() => {});
  const started = opts.now ?? new Date();
  const runId = runIdFor(started);
  const outDir = opts.outDir;
  const runDir = join(outDir, runId);
  let createdRunDir = false;

  const fail = (reason: string): never => {
    if (!opts.noStatus) {
      try {
        writeBackupStatus(opts.dataDir, failedStatus(started.toISOString(), runDir, reason));
      } catch {
        /* never mask the original failure with a status-write failure */
      }
    }
    if (createdRunDir) {
      // A failed run leaves no half-archive behind: a partial tree looks like a
      // restorable backup and is not one.
      try {
        rmSync(runDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
    throw new Error(reason);
  };

  // ── Pre-flight: refuse anything that could destroy or mislead ─────────────
  let dataDirIsDir = false;
  try {
    dataDirIsDir = statSync(opts.dataDir).isDirectory();
  } catch {
    dataDirIsDir = false;
  }
  if (!dataDirIsDir) return fail(`DATA_DIR does not exist: ${opts.dataDir}`);
  if (/\/shared\/site\//.test(outDir) || outDir.endsWith("/site") || outDir.includes("/site/")) {
    return fail(`refusing to write a backup inside the publish tree: ${outDir}`);
  }
  if (outDir === opts.dataDir || outDir.startsWith(opts.dataDir + "/")) {
    return fail(`refusing to write a backup inside the data dir it is archiving: ${outDir}`);
  }
  if (existsSync(runDir)) return fail(`run dir already exists (two runs in the same second?): ${runDir}`);

  mkdirSync(outDir, { recursive: true, mode: 0o700 });
  mkdirSync(runDir, { recursive: true, mode: 0o700 });
  createdRunDir = true;
  chmodSync(runDir, 0o700);

  // ── Collect + verify (torn-write defence, JSON re-parse) ──────────────────
  let collected: CollectResult;
  try {
    collected = collectVerifiedFiles(opts.dataDir);
  } catch (e: any) {
    return fail(e?.message || String(e));
  }

  // ── COVERAGE ASSERTION: every declared store that holds data is archived ──
  const coverage = checkCoverage(
    opts.dataDir,
    collected.files.map((f) => f.path),
    opts.declaredStores ?? DURABLE_STORES,
  );
  if (!coverage.ok) return fail(coverageFailureMessage(coverage));

  log(
    `files ${collected.totals.files} (${collected.totals.jsonFiles} json, ${collected.totals.vaultBlobs} vault blobs, ` +
      `${collected.totals.nativeDocs} native docs, ${collected.totals.otherFiles} other), ${collected.totals.bytes} bytes; ` +
      `coverage ${coverage.rows.length} declared stores, ${coverage.uncovered.length} uncovered`,
  );

  // ── Copy the bytes we already verified, then prove the copy is identical ──
  const stage = join(runDir, "data");
  mkdirSync(stage, { recursive: true, mode: 0o700 });
  for (const f of collected.files) {
    const src = join(opts.dataDir, f.path);
    const dst = join(stage, f.path);
    mkdirSync(dirname(dst), { recursive: true, mode: 0o700 });
    try {
      copyFileSync(src, dst);
      chmodSync(dst, 0o600);
    } catch (e: any) {
      return fail(`could not copy ${f.path}: ${e?.message || e}`);
    }
    const copied = sha256Of(readFileSync(dst));
    if (copied !== f.sha256) {
      return fail(`copy of ${f.path} does not match the verified source digest (source changed mid-run?)`);
    }
  }

  const manifest = buildManifest({
    runId,
    takenAt: started.toISOString(),
    source: {
      host: opts.host ?? hostname(),
      dataDir: opts.dataDir,
      gitSha: opts.gitSha ?? "unknown",
      durableEnabled: !!opts.durableEnabled,
    },
    files: collected.files,
    totals: collected.totals,
    excluded: collected.excluded,
    coverage: coverage.rows,
    encryption: opts.encrypt ? "openssl-aes-256-cbc" : "off",
    archive: opts.encrypt ? `${runId}.tar.gz.enc` : null,
  });
  atomicWriteSync(join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  try {
    chmodSync(join(runDir, "manifest.json"), 0o600);
  } catch {
    /* mode already 600 from atomicWriteSync for a new file */
  }

  if (opts.encrypt) {
    try {
      opts.encrypt(runDir, manifest);
    } catch (e: any) {
      return fail(`encryption failed: ${e?.message || e}`);
    }
  }

  // ── Retention: never the run we just wrote ────────────────────────────────
  const pruned: Array<{ runId: string; bytes: number }> = [];
  if (!opts.noPrune) {
    let runs: string[] = [];
    try {
      runs = readdirSync(outDir)
        .filter((name) => {
          try {
            return statSync(join(outDir, name)).isDirectory() && existsSync(join(outDir, name, "manifest.json"));
          } catch {
            return false;
          }
        })
        .sort();
    } catch {
      runs = [];
    }
    const plan = planRetention(runs, { daily: opts.keepDaily ?? 7, weekly: opts.keepWeekly ?? 4 });
    for (const oldRun of plan.prune) {
      if (oldRun === runId) continue;
      const dir = join(outDir, oldRun);
      let bytes = 0;
      try {
        for (const f of readdirSync(dir)) {
          try {
            bytes += statSync(join(dir, f)).size;
          } catch {
            /* unreadable entry — not counted */
          }
        }
        rmSync(dir, { recursive: true, force: true });
        pruned.push({ runId: oldRun, bytes });
        log(`pruned ${oldRun} (${bytes} bytes)`);
      } catch (e: any) {
        log(`WARNING: could not prune ${oldRun}: ${e?.message || e}`);
      }
    }
    log(`retention: keep ${plan.keep.length} run(s), pruned ${pruned.length}`);
  }

  if (!opts.noStatus) {
    try {
      writeBackupStatus(opts.dataDir, statusFor(manifest, runDir));
    } catch (e: any) {
      log(`WARNING: could not write ${BACKUP_STATUS_FILE}: ${e?.message || e}`);
    }
  }

  return {
    runId,
    target: runDir,
    files: collected.totals.files,
    bytes: collected.totals.bytes,
    pruned,
    coverage: coverage.rows,
    manifest,
  };
}
