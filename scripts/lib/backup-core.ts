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
 *   - `writeJSON` (src/lib/data-store.ts) is a plain whole-document
 *     `writeFileSync` — there is no temp+rename anywhere in src/ — and
 *     `readJSON` returns `{}` on a parse error. So a file copied mid-write can
 *     be TORN, and a torn file reads back as an EMPTY STORE. A backup taken over
 *     a live server must therefore prove each file was stable and re-parses,
 *     or fail loudly rather than produce a silent empty store.
 *   - Restoring `prod-server.lock` / `liveness-watchdog.lock` makes a fresh
 *     instance refuse to boot (src/lib/single-instance.ts), so locks are never
 *     archived and never restored.
 *   - The archive is SAME-HOST. It is not off-box and must never be described
 *     as off-box, DR-grade, or "backups" in public copy.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

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
}): Manifest {
  return {
    runId: input.runId,
    takenAt: input.takenAt,
    source: input.source,
    files: input.files,
    totals: input.totals,
    excluded: input.excluded,
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
