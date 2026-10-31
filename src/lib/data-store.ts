import { join } from "path";
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, cpSync } from "fs";
import { atomicWriteSync } from "./atomic-write";
import { durableEnabled, durableGet, durableHas, durableKeyFor, durableSet, durableGetLive, durableFlush, isPlainObject } from "./durable-store";
import { isOwnerRole, LEGACY_OWNER_EMAIL } from "./user-roles";

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

/**
 * SLICE 150: resolution and the publish-tree predicate moved to
 * `./data-dir-policy` so the backup scripts and the server share ONE rule, and
 * so the rule can relocate a data dir out of a publish tree instead of merely
 * warning about it. Re-exported here because every store already imports it
 * from this module.
 */
export { resolveDataDir, isInsidePublishTree, publishTreeEscapeDir, relocateOutOfPublishTree } from "./data-dir-policy";

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
  // Test isolation (security gate): the self-hosted test suite boots
  // prod-server with an ISOLATED data dir under /tmp. It must NEVER copy the
  // canonical host's live store into that dir — the legacy candidate includes
  // /home/team/shared/site/.data, which holds REAL OAuth credentials. That
  // spill made oauth-disconnect-durable read the owner's live Xero JWT from
  // the "isolated" test dir (and any suite could). test-env.ts sets
  // SKIP_LEGACY_MIGRATION=1 for every spawned test server; production boots
  // never set it, so the post-deploy recovery migration is unchanged.
  if (process.env.SKIP_LEGACY_MIGRATION === "1") return { migrated: 0, legacyDir: null };
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
      // Never resurrect the source's ownership lock (prod-server.lock is a
      // runtime artifact naming the LIVE server's pid; copying it into a fresh
      // dir makes the single-instance guard refuse to boot the new instance —
      // a boot trap). Locks are re-created on start, never data.
      if (name.endsWith(".lock")) continue;
      const src = join(legacyDir, name);
      const dst = join(dataDir, name);
      const st = statSync(src);
      if (existsSync(dst)) continue; // create-if-missing only
      // SLICE 150: directory-shaped stores are DATA. `vault/blobs/**` holds every
      // stored document byte, and the file-only copy below silently skipped it —
      // a migration that reported "30 files copied" while leaving every document
      // behind. Directories are copied recursively, still create-if-missing
      // (`force: false` keeps an existing file).
      if (st.isDirectory()) {
        cpSync(src, dst, { recursive: true, force: false, errorOnExist: false });
        migrated++;
        continue;
      }
      if (!st.isFile()) continue;
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

/**
 * Structured record of the last unparseable store read (SLICE 144).
 *
 * `readJSON` keeps its `{}` fallback so a single corrupt file cannot take the
 * server down, but it must never be SILENT again: a torn write used to turn a
 * customer's store into an empty one with no crash, no log an operator would
 * notice and no counter. Every parse failure of an EXISTING file now bumps a
 * counter, remembers the last failure and emits one structured log line; the
 * owner-only admin surface (`/api/admin/datadir`) reports both.
 */
export interface StoreReadError {
  file: string;
  error: string;
  at: string;
}

let storeReadErrorCount = 0;
let lastStoreReadError: StoreReadError | null = null;

/** Last/aggregate parse failure across every store read in this process. */
export function storeReadErrorStats(): { count: number; last: StoreReadError | null } {
  return { count: storeReadErrorCount, last: lastStoreReadError };
}

/** Reset the counters (tests only — never called by the server). */
export function resetStoreReadErrorStats(): void {
  storeReadErrorCount = 0;
  lastStoreReadError = null;
}

function recordStoreReadError(file: string, err: unknown): StoreReadError {
  const message = (err as any)?.message || String(err);
  storeReadErrorCount += 1;
  const record: StoreReadError = { file, error: message, at: new Date().toISOString() };
  lastStoreReadError = record;
  // Structured, one line, attributable: the file, the parse error and the
  // running count. A grep for "store_parse_error" finds every occurrence.
  console.error(
    JSON.stringify({
      event: "store_parse_error",
      severity: "error",
      file,
      error: message,
      at: record.at,
      totalParseErrors: storeReadErrorCount,
    }),
  );
  return record;
}

/** Read a JSON file; a MISSING file reads as {} (never throws). */
export function readJSON(path: string): any {
  const key = durableKeyFor(path);
  const dv = durableGet(key);
  if (dv !== undefined) return dv;
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e: any) {
    // The file EXISTS but does not parse: that is data loss in progress, not a
    // normal empty store. Log it loudly and count it, then keep the historical
    // {} fallback so one bad file cannot break every reader of this store.
    recordStoreReadError(path, e);
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

/**
 * Write a JSON file (pretty-printed). Mirrors to the durable store too.
 *
 * SLICE 144: this used to be a bare `writeFileSync` of the whole document, which
 * truncates the target before streaming the new bytes in. A crash or a full disk
 * mid-write left a torn document that `readJSON` answers with `{}` — silent,
 * total loss of that store. It is now all-or-nothing (temp file → fsync →
 * rename → directory fsync; see atomic-write.ts). Signature, return value and
 * the durable-store mirror are unchanged, so no caller changes.
 *
 * A failed write THROWS. It never reports success and never leaves the original
 * document damaged.
 */
export function writeJSON(path: string, data: any): void {
  durableSet(durableKeyFor(path), data);
  atomicWriteSync(path, JSON.stringify(data, null, 2));
}

/**
 * Merge-on-write for the credential store (P0 #235).
 *
 * The store is a single JSON object keyed `${email}:${provider}` and whole-object
 * writes (writeJSON of a caller's in-memory snapshot) are destructive: a writer
 * whose snapshot predates another instance's fresh row (e.g. an OAuth reconnect
 * persisted by the callback) silently erases that row from the authoritative
 * store and the local file. This helper makes EVERY credential change a
 * read-live → mutate-exactly-the-intended-key(s) → write cycle, so a writer can
 * never clobber a row it didn't know about (the owner's Xero reconnect kept
 * being wiped by an older instance's refresh tick — #235).
 *
 * Fail-closed: if the live read yields something that is not a plain object we
 * THROW instead of overwriting the store with a stale/unknown snapshot. The live
 * read uses readJSONLive (durable store → cache → file), so when the durable
 * store is disabled this is a plain file read and behavior is unchanged.
 */
export type CredentialMutation =
  | { type: "set"; key: string; value: any }
  | { type: "delete"; key: string };

export async function mergeDurableCredential(
  file: string,
  mutations: CredentialMutation[],
): Promise<void> {
  const current = await readJSONLive(file);
  if (current === null || typeof current !== "object" || Array.isArray(current)) {
    throw new Error(
      `mergeDurableCredential: authoritative store at ${file} is not a plain object; refusing to overwrite`,
    );
  }
  const tokenData = current as Record<string, any>;
  let changed = false;
  for (const m of mutations) {
    if (m.type === "set") {
      tokenData[m.key] = m.value;
      changed = true;
    } else if (Object.prototype.hasOwnProperty.call(tokenData, m.key)) {
      delete tokenData[m.key];
      changed = true;
    }
  }
  if (!changed) return;
  writeJSON(file, tokenData);
  await durableFlush();
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

  // tenant_oauth_credentials.json — persists OAuth tokens across deploys.
  // Repair-if-primitive: a string-shaped value would break every OAuth read.
  ensurePlainObjectFile(join(dataDir, "tenant_oauth_credentials.json"));

  // Seed admin user if no admin exists (create-if-missing only). users.json
  // must be a plain object first — the admin block below assigns `users[email]`.
  ensurePlainObjectFile(join(dataDir, "users.json"));
  const adminEmail = process.env.ADMIN_EMAIL || LEGACY_OWNER_EMAIL;
  const usersFile = join(dataDir, "users.json");
  const users = readJSON(usersFile);
  const hasAdmin = Object.values(users).some((u: any) => u && isOwnerRole(u.role));
  if (!hasAdmin) {
    const { hashSync } = require("bcryptjs") as typeof import("bcryptjs");
    const adminPass = process.env.ADMIN_PASSWORD || "Mdsl1234";
    // P1-5 role-based gating: if the owner account ALREADY exists (e.g. it was
    // registered before roles existed) promote it to admin in place so role
    // gates never silently lock the owner out — and NEVER overwrite a live
    // password. Only a missing/broken row gets a fresh hash.
    const existing = users[adminEmail];
    if (existing && typeof existing === "object") {
      existing.role = "admin";
      if (!existing.password) existing.password = hashSync(adminPass, 10);
      existing.createdAt = existing.createdAt || Date.now();
      writeJSON(usersFile, users);
    } else {
      users[adminEmail] = {
        email: adminEmail,
        password: hashSync(adminPass, 10),
        role: "admin",
        createdAt: Date.now(),
      };
      writeJSON(usersFile, users);
    }
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
