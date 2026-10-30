/**
 * entitlement-store.ts — slice 142. The I/O half of the entitlement layer.
 *
 * `entitlements.ts` holds the DECISION (pure, tested, shared with the client
 * bundle). This file only loads the stores that decision reads, so every gate
 * and the portal billing page resolve a tenant the same way:
 *
 *   - `tenant_subscriptions.json` (slice 139) → the tenant's STATE
 *   - `tenant_purchases.json`                  → the TIER (written by the
 *                                                 signature-verified Stripe
 *                                                 webhook)
 *   - `users.json[email].entitlements.tier`    → last-resort tier signal
 *
 * Nothing here writes. A gate that refuses must refuse BEFORE any store
 * mutation, so this module is read-only by construction.
 */
import { join } from "node:path";
import { readJSON, resolveDataDir } from "./data-store";
import { isOwnerUser } from "./user-roles";
import {
  checkFeature,
  checkImportQuota,
  countImportRowsInMonth,
  monthKeyOf,
  resolveEntitlement,
  type Entitlement,
  type Feature,
  type FeatureCheck,
  type ImportQuotaResult,
} from "./entitlements";

const PURCHASES_FILE = "tenant_purchases.json";
const SUBSCRIPTIONS_FILE = "tenant_subscriptions.json";
const USERS_FILE = "users.json";
const FILE_IMPORT_JOBS_FILE = "file_import_jobs.json";
const IMPORT_RUNS_FILE = "import_runs.json";

function dir(dataDir?: string): string {
  return resolveDataDir(dataDir ?? process.env.DATA_DIR, process.cwd());
}

function readObject(path: string): Record<string, any> {
  try {
    const raw = readJSON(path);
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

/** The current calendar month in UTC as `YYYY-MM` (the quota period). */
export function currentMonthKey(now: Date = new Date()): string {
  return monthKeyOf(now);
}

/** Resolve one tenant's entitlement. Unknown email → `tier: "none"`. */
export function loadEntitlement(email: string, dataDir?: string): Entitlement {
  const tenant = String(email || "").trim();
  const base = dir(dataDir);
  if (!tenant) return resolveEntitlement({ email: "" });
  const purchases = readObject(join(base, PURCHASES_FILE));
  const subscriptions = readObject(join(base, SUBSCRIPTIONS_FILE));
  const users = readObject(join(base, USERS_FILE));
  const user = users[tenant] || users[tenant.toLowerCase()] || null;
  const accountTier = user && user.entitlements && typeof user.entitlements === "object" ? user.entitlements.tier : null;
  return resolveEntitlement({
    email: tenant,
    purchases,
    subscriptions,
    accountTier,
    owner: isOwnerUser(user),
  });
}

/** `requireFeature` — the server-side gate. Pure decision over loaded stores. */
export function requireFeature(email: string, feature: Feature, dataDir?: string): FeatureCheck {
  const entitlement = loadEntitlement(email, dataDir);
  // A tenant with NO plan on record is not a paying Starter: there is no
  // purchased limit to enforce, so the gate does not invent one. The paid
  // tiers are enforced exactly as they were sold.
  if (!entitlement.enforce) return { allowed: true, feature, tier: entitlement.tier };
  return checkFeature(entitlement, feature);
}

/**
 * Rows this tenant has written this month, across both import lanes. Counted
 * from what the stores actually recorded — never estimated, never inferred
 * from a file the tenant merely uploaded.
 */
export function importRowsUsedThisMonth(email: string, dataDir?: string, monthKey: string = currentMonthKey()): number {
  const base = dir(dataDir);
  const tenant = String(email || "").trim();
  if (!tenant) return 0;
  const jobs = readObject(join(base, FILE_IMPORT_JOBS_FILE))[tenant];
  const runs = readObject(join(base, IMPORT_RUNS_FILE))[tenant];
  return countImportRowsInMonth(
    { fileJobs: Array.isArray(jobs) ? jobs : [], importRuns: Array.isArray(runs) ? runs : [] },
    monthKey,
  );
}

export interface ImportGateDecision {
  entitlement: Entitlement;
  quota: ImportQuotaResult;
}

/**
 * The one decision every import commit path calls before it writes anything.
 * `requestedRows` is the number of rows that commit would write.
 */
export function checkImportAllowed(email: string, requestedRows: number, dataDir?: string): ImportGateDecision {
  const entitlement = loadEntitlement(email, dataDir);
  const used = importRowsUsedThisMonth(email, dataDir);
  return { entitlement, quota: checkImportQuota(entitlement, used, requestedRows) };
}
