import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

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
