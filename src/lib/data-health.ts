/**
 * data-health.ts — SLICE 162. Does our data still exist after a publish?
 *
 * THE QUESTION THIS FILE ANSWERS: the plan promises clients that their data
 * lives outside anything a publish can replace. That was proven on the dev box
 * by reading the boot log. It was NOT answerable for a deployment running on a
 * filesystem nobody here can see: slice 160 found the deployed server deriving
 * DATA_DIR from its own location, and slice 160's fix logs
 * `insidePublishTree=false` at boot — but a boot log is not a durable answer,
 * and nothing could say "my data survived the last publish" from outside.
 *
 * THE PROOF IS A FILE INSIDE THE DATA DIRECTORY, NOT A CONFIG GUESS:
 *   `<DATA_DIR>/deployment-generation.json`
 *   { version, firstSeenAt, lastBootAt, boots, buildsSeen: [{ id, firstBootAt }] }
 *
 *   - On boot: absent → created with firstSeenAt = now, boots = 1.
 *              present → boots += 1, firstSeenAt PRESERVED, lastBootAt = now.
 *   - So if `firstSeenAt` predates this process AND predates the running build,
 *     the directory (and therefore everything in it) survived the publish that
 *     deployed that build. If the publish had replaced the tree, the marker
 *     would have gone with it and firstSeenAt would be newer than the build.
 *   - `buildsSeen` strengthens that with identity rather than clock: each boot
 *     records a hash of the running server entry file. Two or more distinct ids
 *     means this directory has already been booted under more than one build
 *     WITHOUT being recreated — publish survival, observed, not inferred from
 *     mtimes that a publisher may rewrite or preserve.
 *
 * HONESTY RULES THIS FILE OBEYS:
 *   - Everything is read from the filesystem at request time (stat / read), never
 *     from a cached config value or an env var. An absent file is reported as
 *     absent, never as "fine".
 *   - A marker that cannot be parsed is a FAILED proof: the verdict goes red and
 *     says so, instead of quietly starting a fresh count and looking healthy.
 *   - No fabricated health. When the running build's timestamp cannot be
 *     established the verdict is "unknown", not "green".
 *
 * The marker is registered in `durable-stores.ts` so the hourly archive carries
 * it (slice 161's rule: a durable file missing from that list is skipped by
 * every backup while the coverage table still claims full coverage).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { atomicWriteJSONSync } from "./atomic-write";
import { DURABLE_STORES, isDirectoryStore } from "./durable-stores";
import { isInsidePublishTree } from "./data-dir-policy";
import type { BackupHealthReport } from "./backup-health";

/** The durable generation marker, relative to DATA_DIR. */
export const GENERATION_MARKER_FILE = "deployment-generation.json";
export const GENERATION_MARKER_VERSION = 1;
/** How many distinct builds the marker remembers (bounded, oldest dropped). */
export const MAX_BUILDS_SEEN = 20;
/** A directory-store walk stops here; the row then says it was truncated. */
export const MAX_DIRECTORY_ENTRIES = 20_000;

export interface BuildSeen {
  /** Content hash of the running server entry file, or "unknown". */
  id: string;
  firstBootAt: string;
}

export interface GenerationMarker {
  version: number;
  /** When this data directory was first seen by any boot. Never rewritten. */
  firstSeenAt: string;
  /** When the most recent boot touched the marker. */
  lastBootAt: string;
  /** How many boots have seen this directory. */
  boots: number;
  /** Distinct builds this directory has been booted under. */
  buildsSeen: BuildSeen[];
  /** Set when a previous marker existed but could not be read. */
  corruptPrevious?: boolean;
}

/** Absolute path of the generation marker for a data directory. */
export function generationMarkerPath(dataDir: string): string {
  return join(dataDir, GENERATION_MARKER_FILE);
}

/**
 * Identity of the build that is running right now: the content hash of the
 * server entry file. Stable across restarts of the same build, different after
 * a publish that changes any server code — so it survives the case where a
 * publisher rewrites or preserves file mtimes.
 */
export function runningBuildId(entryPath: string | null | undefined): string | null {
  if (!entryPath) return null;
  try {
    return "sha256:" + createHash("sha256").update(readFileSync(entryPath)).digest("hex").slice(0, 32);
  } catch {
    return null;
  }
}

function parseMarker(raw: unknown): GenerationMarker | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as any;
  if (typeof m.firstSeenAt !== "string" || Number.isNaN(new Date(m.firstSeenAt).getTime())) return null;
  if (typeof m.boots !== "number" || !Number.isFinite(m.boots) || m.boots < 1) return null;
  const buildsSeen: BuildSeen[] = Array.isArray(m.buildsSeen)
    ? m.buildsSeen
        .filter((b: any) => b && typeof b.id === "string" && typeof b.firstBootAt === "string")
        .map((b: any) => ({ id: b.id, firstBootAt: b.firstBootAt }))
    : [];
  return {
    version: typeof m.version === "number" ? m.version : 0,
    firstSeenAt: m.firstSeenAt,
    lastBootAt: typeof m.lastBootAt === "string" ? m.lastBootAt : m.firstSeenAt,
    boots: Math.floor(m.boots),
    buildsSeen,
    corruptPrevious: m.corruptPrevious === true ? true : undefined,
  };
}

export interface MarkerRead {
  path: string;
  present: boolean;
  marker: GenerationMarker | null;
  /** Why the marker could not be used, when it exists but is unusable. */
  error: string | null;
}

/** Read the generation marker from disk. Never throws. */
export function readGenerationMarker(dataDir: string): MarkerRead {
  const path = generationMarkerPath(dataDir);
  let present = false;
  try {
    present = existsSync(path);
  } catch {
    present = false;
  }
  if (!present) return { path, present: false, marker: null, error: null };
  try {
    const marker = parseMarker(JSON.parse(readFileSync(path, "utf-8")));
    if (!marker) return { path, present: true, marker: null, error: "marker file is present but is not a valid generation marker" };
    return { path, present: true, marker, error: null };
  } catch (e: any) {
    return { path, present: true, marker: null, error: e?.message || String(e) };
  }
}

export interface BootRecord {
  ok: boolean;
  /** True when this boot CREATED the marker (the directory is new to us). */
  created: boolean;
  marker: GenerationMarker | null;
  path: string;
  error: string | null;
}

/**
 * Record one boot of the server against `dataDir`. Called once per boot from
 * prod-server.ts, after DATA_DIR has been resolved and the legacy migration has
 * run — so the marker is written into the directory the process actually uses.
 *
 * Never throws: a marker that cannot be written is a loud warning and a `false`
 * result, never a failed boot (a data directory we cannot write to is already
 * reported by every other store).
 */
export function recordDeploymentBoot(
  dataDir: string,
  opts: { now?: Date; buildId?: string | null } = {},
): BootRecord {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const path = generationMarkerPath(dataDir);
  const buildId = opts.buildId ?? "unknown";
  const existing = readGenerationMarker(dataDir);
  let created = false;
  let marker: GenerationMarker;
  if (existing.marker) {
    const buildsSeen = existing.marker.buildsSeen.slice();
    if (!buildsSeen.some((b) => b.id === buildId)) {
      buildsSeen.push({ id: buildId, firstBootAt: nowIso });
      while (buildsSeen.length > MAX_BUILDS_SEEN) buildsSeen.shift();
    }
    marker = {
      version: GENERATION_MARKER_VERSION,
      // THE POINT OF THIS FILE: firstSeenAt is carried forward untouched.
      firstSeenAt: existing.marker.firstSeenAt,
      lastBootAt: nowIso,
      boots: existing.marker.boots + 1,
      buildsSeen,
      ...(existing.marker.corruptPrevious ? { corruptPrevious: true } : {}),
    };
  } else {
    created = true;
    marker = {
      version: GENERATION_MARKER_VERSION,
      firstSeenAt: nowIso,
      lastBootAt: nowIso,
      boots: 1,
      buildsSeen: [{ id: buildId, firstBootAt: nowIso }],
      // A marker that existed but was unreadable is recorded, so the next reader
      // can see that the continuity of this directory was interrupted.
      ...(existing.present ? { corruptPrevious: true } : {}),
    };
  }
  try {
    mkdirSync(dirname(path), { recursive: true });
    atomicWriteJSONSync(path, marker);
    return { ok: true, created, marker, path, error: null };
  } catch (e: any) {
    return { ok: false, created, marker, path, error: e?.message || String(e) };
  }
}

export interface DurableStoreRow {
  store: string;
  kind: "file" | "directory";
  present: boolean;
  /** Bytes on disk (summed for a directory store), null when not present. */
  bytes: number | null;
  mtime: string | null;
  /** Files found inside a directory store; null for a file store. */
  entries: number | null;
  /** True when a directory walk hit MAX_DIRECTORY_ENTRIES. */
  truncated: boolean;
  error: string | null;
}

function describeDirectoryStore(dataDir: string, store: string): DurableStoreRow {
  const path = join(dataDir, store);
  let bytes = 0;
  let entries = 0;
  let truncated = false;
  let mtimeMs: number | null = null;
  try {
    if (!statSync(path).isDirectory()) {
      return { store, kind: "directory", present: false, bytes: null, mtime: null, entries: null, truncated: false, error: "not a directory" };
    }
  } catch (e: any) {
    const missing = e?.code === "ENOENT";
    return { store, kind: "directory", present: false, bytes: null, mtime: null, entries: null, truncated: false, error: missing ? null : e?.message || String(e) };
  }
  const walk = (dir: string): void => {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (entries >= MAX_DIRECTORY_ENTRIES) {
        truncated = true;
        return;
      }
      const p = join(dir, name);
      try {
        const st = statSync(p);
        if (st.isDirectory()) {
          walk(p);
        } else {
          entries += 1;
          bytes += st.size;
          if (mtimeMs === null || st.mtimeMs > mtimeMs) mtimeMs = st.mtimeMs;
        }
      } catch {
        /* an unreadable entry is skipped; `truncated`/counts stay truthful */
      }
    }
  };
  walk(path);
  return {
    store,
    kind: "directory",
    present: true,
    bytes,
    mtime: mtimeMs === null ? null : new Date(mtimeMs).toISOString(),
    entries,
    truncated,
    error: null,
  };
}

function describeFileStore(dataDir: string, store: string): DurableStoreRow {
  const path = join(dataDir, store);
  try {
    const st = statSync(path);
    return {
      store,
      kind: "file",
      present: true,
      bytes: st.size,
      mtime: new Date(st.mtimeMs).toISOString(),
      entries: null,
      truncated: false,
      error: null,
    };
  } catch (e: any) {
    const missing = e?.code === "ENOENT";
    return {
      store,
      kind: "file",
      present: false,
      bytes: null,
      mtime: null,
      entries: null,
      truncated: false,
      // ENOENT is the ordinary "this store has never been written" answer.
      error: missing ? null : e?.message || String(e),
    };
  }
}

/** One row per declared durable store, read from the filesystem. */
export function describeDurableStores(dataDir: string): DurableStoreRow[] {
  return DURABLE_STORES.map((store) =>
    isDirectoryStore(store) ? describeDirectoryStore(dataDir, store) : describeFileStore(dataDir, store),
  );
}

export type DataHealthVerdict = "green" | "red" | "unknown";

export interface DataHealthReport {
  /** True only for a green verdict — a red or unknown result is never "ok". */
  ok: boolean;
  verdict: DataHealthVerdict;
  /** Every reason the verdict is what it is, in plain words. */
  reasons: string[];
  dataDir: string;
  /** The path the policy STARTED from, before any relocation. */
  rawDataDir: string | null;
  /** True when the data-dir policy moved DATA_DIR out of the publish tree. */
  relocated: boolean;
  insidePublishTree: boolean;
  serverBase: string;
  processStartedAt: string;
  processUptimeSeconds: number;
  /** Newest mtime among the build artifacts that were actually found. */
  runningBuildAt: string | null;
  runningBuildAtSource: string | null;
  buildArtifacts: { path: string; mtime: string | null; present: boolean }[];
  /** Content hash of the running server entry file. */
  runningBuildId: string | null;
  marker: {
    path: string;
    present: boolean;
    insideDataDir: boolean;
    insidePublishTree: boolean;
    firstSeenAt: string | null;
    lastBootAt: string | null;
    boots: number | null;
    buildsSeen: number;
    corruptPrevious: boolean;
    error: string | null;
  };
  /** firstSeenAt older than this process → the directory outlived a restart. */
  survivedProcessStart: boolean | null;
  /** firstSeenAt older than the running build → it outlived the publish. */
  survivedRunningBuild: boolean | null;
  /** Distinct builds recorded in the marker; >1 proves a publish was survived. */
  distinctBuilds: number;
  durableStores: {
    declared: number;
    present: number;
    missing: string[];
    rows: DurableStoreRow[];
  };
  /**
   * SLICE 163 — the OFF-BOX half of the same question. Slice 162 answered "did
   * this data survive a publish?"; this answers "would it survive the disk?".
   * Present only when the caller supplies it (the running server always does);
   * when present and not green, the overall verdict cannot be green either — a
   * deployment whose data exists in exactly one place is not healthy, whatever
   * else is true of it.
   */
  backup: BackupHealthReport | null;
  checkedAt: string;
}

/**
 * Build the owner's answer. Everything here is measured at call time.
 *
 * `buildArtifacts` are the files whose mtime bounds the running build — the
 * server entry file, and the built client entry when one exists. The NEWEST of
 * them is used: a publish that rebuilt any of them is newer than the rest.
 */
export function buildDataHealthReport(opts: {
  dataDir: string;
  rawDataDir?: string | null;
  serverBase: string;
  processStartedAt: Date;
  buildArtifacts?: string[];
  runningBuildId?: string | null;
  /** SLICE 163 — the off-box half. Omitted by callers that cannot measure it. */
  backup?: BackupHealthReport | null;
  now?: Date;
}): DataHealthReport {
  const now = opts.now ?? new Date();
  const dataDir = resolve(opts.dataDir);
  const serverBase = resolve(opts.serverBase);
  const insidePublishTree = isInsidePublishTree(dataDir, serverBase);
  const rawDataDir = opts.rawDataDir ? resolve(opts.rawDataDir) : null;
  const relocated = rawDataDir !== null && rawDataDir !== dataDir;

  const artifacts = (opts.buildArtifacts ?? []).map((p) => {
    const abs = resolve(p);
    try {
      return { path: abs, mtime: new Date(statSync(abs).mtimeMs).toISOString(), present: true };
    } catch {
      return { path: abs, mtime: null, present: false };
    }
  });
  let runningBuildAt: string | null = null;
  let runningBuildAtSource: string | null = null;
  for (const a of artifacts) {
    if (!a.mtime) continue;
    if (runningBuildAt === null || new Date(a.mtime).getTime() > new Date(runningBuildAt).getTime()) {
      runningBuildAt = a.mtime;
      runningBuildAtSource = a.path;
    }
  }

  const read = readGenerationMarker(dataDir);
  const markerPath = read.path;
  const markerInsideDataDir = markerPath === join(dataDir, GENERATION_MARKER_FILE) || markerPath.startsWith(dataDir + sep);

  const reasons: string[] = [];
  let verdict: DataHealthVerdict = "green";

  if (insidePublishTree) {
    verdict = "red";
    reasons.push(
      `DATA_DIR (${dataDir}) is inside the publish tree (${serverBase}) — a publish can replace it, so the data in it is not durable.`,
    );
  }
  if (read.error) {
    verdict = "red";
    reasons.push(`The generation marker could not be read (${read.error}) — survival of this data directory cannot be proven.`);
  } else if (!read.present) {
    verdict = "red";
    reasons.push(
      `No generation marker at ${markerPath} — this boot has not recorded one yet, so survival of this data directory cannot be proven.`,
    );
  }
  if (read.marker?.corruptPrevious) {
    verdict = "red";
    reasons.push("A previous generation marker existed but could not be read; the marker was restarted from this boot.");
  }

  const firstSeenAt = read.marker?.firstSeenAt ?? null;
  const processStartMs = opts.processStartedAt.getTime();
  const survivedProcessStart =
    firstSeenAt === null ? null : new Date(firstSeenAt).getTime() < processStartMs;
  const survivedRunningBuild =
    firstSeenAt === null || runningBuildAt === null
      ? null
      : new Date(firstSeenAt).getTime() < new Date(runningBuildAt).getTime();

  if (survivedProcessStart === false) {
    verdict = "red";
    reasons.push(
      `The marker's firstSeenAt (${firstSeenAt}) is not older than this process (started ${opts.processStartedAt.toISOString()}) — this data directory was created by this boot, so nothing in it survived a restart or a publish.`,
    );
  }
  if (survivedRunningBuild === false) {
    verdict = "red";
    reasons.push(
      `The marker's firstSeenAt (${firstSeenAt}) is newer than the running build (${runningBuildAt} from ${runningBuildAtSource}) — this data directory was created after the build that is serving now, i.e. a publish replaced it.`,
    );
  }
  if (runningBuildAt === null) {
    if (verdict === "green") verdict = "unknown";
    reasons.push("The running build's timestamp could not be established (no build artifact was readable), so the publish comparison was not made.");
  }

  const distinctBuilds = read.marker?.buildsSeen.length ?? 0;
  if (verdict === "green") {
    reasons.push(
      `The data directory predates both this process and the running build: firstSeenAt ${firstSeenAt}, process started ${opts.processStartedAt.toISOString()}, build ${runningBuildAt}.`,
    );
    if (distinctBuilds > 1) {
      reasons.push(
        `It has already been booted under ${distinctBuilds} distinct builds without being recreated — publish survival observed, not inferred.`,
      );
    }
  }

  // ── SLICE 163 — the OFF-BOX half ─────────────────────────────────────────
  // Surviving a publish is not surviving a disk. A deployment whose archive has
  // never left this machine, or whose last off-box copy is stale, cannot be
  // called healthy here — otherwise this page would say "green" about data that
  // exists in exactly one place.
  const backup = opts.backup ?? null;
  if (backup) {
    if (backup.verdict === "red") {
      verdict = "red";
      reasons.push(`The off-box copy is not current: ${backup.reasons.join(" ")}`);
    } else if (backup.verdict === "never") {
      verdict = "red";
      reasons.push(`There is no off-box copy yet: ${backup.reasons.join(" ")}`);
    } else if (backup.verdict === "unknown") {
      if (verdict === "green") verdict = "unknown";
      reasons.push(`The off-box copy could not be verified: ${backup.reasons.join(" ")}`);
    } else {
      reasons.push(
        `The data also has a fresh off-box copy: last upload ${backup.upload.lastUploadOkAt ?? backup.status.lastOkAt} to ${backup.namespace.prefix}.`,
      );
    }
  }

  const rows = describeDurableStores(dataDir);
  const missing = rows.filter((r) => !r.present).map((r) => r.store);

  return {
    ok: verdict === "green",
    verdict,
    reasons,
    dataDir,
    rawDataDir,
    relocated,
    insidePublishTree,
    serverBase,
    processStartedAt: opts.processStartedAt.toISOString(),
    processUptimeSeconds: Math.round(process.uptime()),
    runningBuildAt,
    runningBuildAtSource,
    buildArtifacts: artifacts,
    runningBuildId: opts.runningBuildId ?? null,
    marker: {
      path: markerPath,
      present: read.present,
      insideDataDir: markerInsideDataDir,
      insidePublishTree: isInsidePublishTree(markerPath, serverBase),
      firstSeenAt,
      lastBootAt: read.marker?.lastBootAt ?? null,
      boots: read.marker?.boots ?? null,
      buildsSeen: distinctBuilds,
      corruptPrevious: read.marker?.corruptPrevious === true,
      error: read.error,
    },
    survivedProcessStart,
    survivedRunningBuild,
    distinctBuilds,
    durableStores: {
      declared: DURABLE_STORES.length,
      present: rows.filter((r) => r.present).length,
      missing,
      rows,
    },
    backup,
    checkedAt: now.toISOString(),
  };
}

/** The boot-log line for the marker — printed once per boot by prod-server.ts. */
export function logDeploymentGeneration(rec: BootRecord): void {
  if (!rec.ok || !rec.marker) {
    console.warn(
      `[data-health] WARNING: could not record the deployment generation marker at ${rec.path} ` +
        `(${rec.error ?? "unknown error"}) — survival of this data directory cannot be proven.`,
    );
    return;
  }
  console.log(
    `[data-health] generation marker file=${rec.path} created=${rec.created} ` +
      `firstSeenAt=${rec.marker.firstSeenAt} boots=${rec.marker.boots} buildsSeen=${rec.marker.buildsSeen.length}`,
  );
  if (rec.marker.corruptPrevious) {
    console.warn(
      `[data-health] WARNING: the previous generation marker at ${rec.path} could not be read; ` +
        `the marker restarted at ${rec.marker.firstSeenAt}.`,
    );
  }
}
