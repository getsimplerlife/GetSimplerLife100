import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "fs";
import { durableEnabled, durableGet, durableHas, durableKeyFor, durableSet, durableGetLive, isPlainObject } from "./durable-store";
import { AGENTS } from "../data/agents";

/**
 * data-store.ts — runtime data directory resolution and boot-time seeding.
 *
 * Why this module exists (connection-persistence fix, 2026-08-11):
 * Runtime data (tenant_integrations.json, tenant_oauth_credentials.json,
 * sessions.json, ...) must live OUTSIDE the publish tree. If DATA_DIR
 * resolves inside the tree that `publish_site` builds and swaps, a publish
 * can replace live runtime data with a stale snapshot — which made
 * integrations/CRM/ERP connections "sometimes disappear from accounts".
 *
 * The resolution order matches the previous inline logic in prod-server.ts:
 *   1. process.env.DATA_DIR (absolute → used as-is; relative → joined to base)
 *   2. fallback → <base>/.data   (base = the directory containing prod-server)
 *
 * `seedDataFiles` is strictly create-if-missing — it never deletes or
 * overwrites existing runtime data. Restarting the server therefore can
 * never wipe connections or OAuth tokens.
 */

/** Resolve the runtime data directory from an env override (or default). */
export function resolveDataDir(envDir: string | undefined, baseDir: string): string {
  if (envDir && envDir.trim()) {
    const value = envDir.trim();
    return value.startsWith("/") ? value : join(baseDir, value);
  }
  return join(baseDir, ".data");
}

/** True when the resolved data dir sits inside a platform publish tree. */
export function isInsidePublishTree(dataDir: string): boolean {
  return /\/shared\/site\//.test(dataDir) || /\/site\/\.data$/.test(dataDir);
}

/**
 * Known publish-tree data dirs from BEFORE the connection-persistence fix
 * (PR #124). The live host's pre-fix store may still exist at one of these
 * paths; the migration below copies it in once, then it is never touched.
 */
export function legacyDataDirCandidates(): string[] {
  const candidates: string[] = [];
  if (process.env.LEGACY_DATA_DIR?.trim()) candidates.push(process.env.LEGACY_DATA_DIR.trim());
  candidates.push("/home/team/shared/site/.data");
  return candidates;
}

/** First existing legacy data dir from the candidate list (null when none). */
export function findLegacyDataDir(candidates: string[] = legacyDataDirCandidates()): string | null {
  for (const c of candidates) {
    if (!c) continue;
    try {
      if (existsSync(c) && statSync(c).isDirectory()) return c;
    } catch (_) { /* unreadable candidate — skip */ }
  }
  return null;
}

/**
 * One-time legacy-store migration (post-deploy recovery, 2026-08-11).
 *
 * On boot with a FRESH/EMPTY resolved DATA_DIR, if a legacy publish-tree
 * data dir still exists (e.g. <site>/.data — the pre-fix store that a
 * publish could wipe), copy its files into the new DATA_DIR. Strictly
 * CREATE-IF-MISSING: an existing target file is never overwritten, and a
 * target dir that already contains data is never touched. Idempotent —
 * running it twice is a no-op the second time.
 *
 * Returns the number of files copied (0 = nothing to migrate / no-op).
 */
export function migrateLegacyData(dataDir: string, candidates: string[] = legacyDataDirCandidates()): { migrated: number; legacyDir: string | null } {
  // Target already populated → never touch it.
  if (existsSync(dataDir)) {
    try {
      const entries = readdirSync(dataDir);
      if (entries.length > 0) return { migrated: 0, legacyDir: null };
    } catch (_) { return { migrated: 0, legacyDir: null }; }
  }
  const legacyDir = findLegacyDataDir(candidates);
  if (!legacyDir || legacyDir === dataDir) return { migrated: 0, legacyDir: null };
  let migrated = 0;
  try {
    mkdirSync(dataDir, { recursive: true });
    for (const name of readdirSync(legacyDir)) {
      const src = join(legacyDir, name);
      const dst = join(dataDir, name);
      if (!statSync(src).isFile()) continue;
      if (existsSync(dst)) continue; // create-if-missing only
      copyFileSync(src, dst);
      migrated++;
    }
  } catch (_) { /* best effort — a partial copy is still safer than losing the legacy store */ }
  return { migrated, legacyDir };
}

/**
 * Count connections in a tenant_integrations.json payload.
 * The store is keyed by tenant email → array of connections; a plain array
 * is also accepted. Non-connection files return 0.
 */
export function countConnections(data: any): number {
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === "object") {
    return Object.values(data).reduce((sum: number, v: any) => sum + (Array.isArray(v) ? v.length : 0), 0);
  }
  return 0;
}

/** Read a JSON file; missing/corrupt files read as {} (never throw). */
export function readJSON(path: string): any {
  const key = durableKeyFor(path);
  const dv = durableGet(key);
  if (dv !== undefined) return dv;
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e: any) {
    console.log("[data-store] FAILED read path=" + path + " err=" + (e?.message || String(e)));
    return {};
  }
}

/**
 * LIVE cross-instance read: query the durable store (Neon) directly before
 * falling back to the per-process cache, then the local file. Guarantees a
 * value written by ANOTHER instance (e.g. OAuth state persisted by the authorize
 * handler) is visible to THIS instance even though its boot-hydrated cache never
 * saw it. Used by the OAuth callback — the multi-instance divergence fix (#232).
 * When the durable store is disabled this is a plain readJSON.
 */
export async function readJSONLive(path: string): Promise<any> {
  if (durableEnabled()) {
    const live = await durableGetLive(durableKeyFor(path));
    if (live !== undefined) return live;
  }
  return readJSON(path);
}

/** Write a JSON file (pretty-printed). Mirrors to the durable store too. */
export function writeJSON(path: string, data: any): void {
  durableSet(durableKeyFor(path), data);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

/** True when the file exists on disk OR the durable store holds its key. */
function fileOrDurableExists(file: string): boolean {
  if (durableEnabled()) {
    const key = durableKeyFor(file);
    if (durableHas(key)) return true;
  }
  return existsSync(file);
}

/**
 * Guarantee a runtime JSON file exists AND parses to a plain object.
 * CREATE-IF-MISSING + REPAIR-IF-PRIMITIVE — real object data is never
 * touched. This is the file/seed-layer half of the "parses-to-primitive"
 * repair (the durable half runs in durable-store.ts repairPrimitiveShapes):
 * a value stored as a JSON *string* (Neon JSONB-string bug, e.g.
 * tenant_purchases.json = '"{}"') parses to a string primitive, and
 * read-modify-write handlers (`data[email] = ...`) throw on it. Normalize
 * to {} and write through (writeJSON mirrors to the durable store too).
 */
function ensurePlainObjectFile(file: string): void {
  if (!fileOrDurableExists(file)) { writeJSON(file, {}); return; }
  try {
    const v = readJSON(file);
    if (!isPlainObject(v)) writeJSON(file, {});
  } catch { writeJSON(file, {}); }
}

/**
 * Boot-time seed: guarantees critical files exist with correct types.
 * CREATE-IF-MISSING ONLY — existing files (connections, OAuth tokens,
 * sessions, purchases) are never deleted, truncated, or overwritten.
 * Durable-aware: when the durable store is enabled, a key present in the
 * durable store counts as "exists" even if the file was wiped by a publish,
 * so real data is never replaced by empty seeds.
 */
export function seedDataFiles(dataDir: string): void {
  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    try { mkdirSync(dataDir, { recursive: true }); } catch (_) { /* best effort */ }
  }

  // integrations.json MUST be an array — .find() crashes on {}
  const intFile = join(dataDir, "integrations.json");
  if (!fileOrDurableExists(intFile)) { writeJSON(intFile, []); }
  else {
    try {
      const v = readJSON(intFile);
      if (!Array.isArray(v)) writeJSON(intFile, []);
    } catch (_) { writeJSON(intFile, []); }
  }
  // ai_employees.json MUST be an array — chat/agent-action handlers call
  // .length/.find() on it. Seeded from the canonical AGENTS list (18).
  // Repair (not clobber): only non-array values (e.g. the old {} default)
  // are replaced; real runtime arrays with agent statuses are untouched.
  const empFile = join(dataDir, "ai_employees.json");
  if (!fileOrDurableExists(empFile)) { writeJSON(empFile, AGENTS); }
  else {
    try {
      const v = readJSON(empFile);
      if (!Array.isArray(v)) writeJSON(empFile, AGENTS);
    } catch (_) { writeJSON(empFile, AGENTS); }
  }

  // tenant_oauth_credentials.json — persists OAuth tokens across deploys.
  // Repair-if-primitive: a string-shaped value would break every OAuth read.
  ensurePlainObjectFile(join(dataDir, "tenant_oauth_credentials.json"));

  // Seed admin user if no admin exists (create-if-missing only). users.json
  // must be a plain object first — the admin block below assigns `users[email]`.
  ensurePlainObjectFile(join(dataDir, "users.json"));
  const adminEmail = process.env.ADMIN_EMAIL || "mathewortiz97@gmail.com";
  const usersFile = join(dataDir, "users.json");
  const users = readJSON(usersFile);
  const hasAdmin = Object.values(users).some((u: any) => u && u.role === "admin");
  if (!hasAdmin) {
    const { hashSync } = require("bcryptjs") as typeof import("bcryptjs");
    const adminPass = process.env.ADMIN_PASSWORD || "Mdsl1234";
    users[adminEmail] = {
      email: adminEmail,
      password: hashSync(adminPass, 10),
      role: "admin",
      createdAt: Date.now(),
    };
    writeJSON(usersFile, users);
  }

  // Critical files exist with correct OBJECT shape (never overwrite real data).
  for (const f of [
    "sessions.json",
    "oauth_states.json",
    "tenant_purchases.json",
    "tenant_audit_logs.json",
    "leads.json",
    "lead_notifications.json",
    "pending_emails.json",
    "chat_sessions.json",
    "tenant_integrations.json",
    "client_files.json",
  ]) {
    ensurePlainObjectFile(join(dataDir, f));
  }
}

/**
 * Bucket connections for the connected-accounts UI.
 * Counts ALL categories: CRM / ERP+Accounting / everything else ("other").
 * A connection with an unknown/blank category lands in `other`, so the
 * three buckets always cover every stored connection.
 */
export function bucketConnectionsByCategory(connections: any[]): { crm: any[]; erp: any[]; other: any[] } {
  const crm: any[] = [];
  const erp: any[] = [];
  const other: any[] = [];
  for (const c of connections || []) {
    const cat = (c?.category || "").toLowerCase();
    if (cat.includes("crm")) {
      crm.push(c);
    } else if (cat.includes("erp") || cat.includes("accounting") || cat.includes("finance")) {
      erp.push(c);
    } else {
      other.push(c);
    }
  }
  return { crm, erp, other };
}
