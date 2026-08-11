import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "fs";

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
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (e: any) {
    console.log("[data-store] FAILED read path=" + path + " err=" + (e?.message || String(e)));
    return {};
  }
}

/** Write a JSON file (pretty-printed). */
export function writeJSON(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

/**
 * Boot-time seed: guarantees critical files exist with correct types.
 * CREATE-IF-MISSING ONLY — existing files (connections, OAuth tokens,
 * sessions, purchases) are never deleted, truncated, or overwritten.
 */
export function seedDataFiles(dataDir: string): void {
  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    try { mkdirSync(dataDir, { recursive: true }); } catch (_) { /* best effort */ }
  }

  // integrations.json MUST be an array — .find() crashes on {}
  const intFile = join(dataDir, "integrations.json");
  if (!existsSync(intFile)) { writeJSON(intFile, []); }
  else {
    try {
      const v = readJSON(intFile);
      if (!Array.isArray(v)) writeJSON(intFile, []);
    } catch (_) { writeJSON(intFile, []); }
  }

  // tenant_oauth_credentials.json — persists OAuth tokens across deploys
  const oauthFile = join(dataDir, "tenant_oauth_credentials.json");
  if (!existsSync(oauthFile)) writeJSON(oauthFile, {});

  // Seed admin user if no admin exists (create-if-missing only)
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

  // Critical files exist with sensible defaults (never overwrite)
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
    "ai_employees.json",
  ]) {
    const file = join(dataDir, f);
    if (!existsSync(file)) writeJSON(file, {});
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
