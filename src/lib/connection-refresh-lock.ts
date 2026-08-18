/**
 * connection-refresh-lock.ts — SINGLE-FLIGHT / EXCLUSIVE REFRESH (#230,
 * lead requirement folded in from the live Xero incident 2026-08-17/18).
 *
 * Incident: Xero (and every OAuth2 provider that rotates refresh tokens)
 * issues SINGLE-USE refresh tokens. The nightly verification batch AND the
 * live hourly sweeper both read the SAME stored refresh token and both called
 * the token endpoint → the first call consumed it, the second one raced,
 * and the loser's write persisted a DEAD token (`invalid_grant "Refresh token
 * has been consumed"`) → Xero 0/26 until the owner reconnects.
 *
 * Fix: a per-provider-key lease, durable across processes (persisted via the
 * normal writeJSON → durable-store path, so it is visible to BOTH the live
 * server and any verification/CLI process sharing the store):
 *   - The REFRESHER is the only owner allowed to refresh while it holds the
 *     lease (owned as `sweeper:<pid>`).
 *   - Any other path (verification adapter, reconnect flow) consults
 *     `hasActiveRefreshLease(...)` before refreshing; if a lease is live it
 *     MUST NOT refresh — it reads the freshest stored token and records
 *     contention instead of racing the single-use token.
 *   - Leases expire (TTL 5 min) so a crashed holder cannot deadlock refreshes.
 * Fail-closed: acquiring over a live lease always returns false.
 */
import { join } from "path";
import { readJSON, writeJSON } from "./data-store";
import { drainPendingWrites } from "./durable-store";

export const REFRESH_LEASE_TTL_MS = 5 * 60 * 1000;
const LEASES_FILE = "refresh_leases.json";

export interface RefreshLease {
  owner: string;
  acquiredAt: number;
  expiresAt: number;
}

/** Contention counters (recorded, never silent — per lead requirement). */
export const refreshContentionStats = {
  contended: 0,
  lastContention: null as string | null,
};

/** Canonical per-provider-key as used by the credential store. */
export function providerKeyFor(email: string, provider: string): string {
  return email ? `${email}:${provider}` : provider;
}

function leases(dataDir: string): Record<string, RefreshLease> {
  return (readJSON(join(dataDir, LEASES_FILE)) as Record<string, RefreshLease> | undefined) || {};
}

function persistLeases(dataDir: string, next: Record<string, RefreshLease>): void {
  writeJSON(join(dataDir, LEASES_FILE), next);
  // Durable across processes: flush now so the LIVE server sees the lease while
  // a verification process runs (or vice versa) — no ≤10-min window.
  void drainPendingWrites().catch(() => {});
}

/** True when a non-expired lease exists for the key (any owner). */
export function hasActiveRefreshLease(dataDir: string, key: string, nowMs: number = Date.now()): boolean {
  const cur = leases(dataDir)[key];
  return Boolean(cur && cur.expiresAt > nowMs);
}

/**
 * Try to claim exclusive refresh ownership for `key`. Returns true when the
 * lease is now ours (no other live lease), false when another owner holds it.
 * Fail-closed: a live foreign lease is NEVER overwritten.
 */
export function acquireRefreshLease(
  dataDir: string,
  key: string,
  owner: string,
  opts: { ttlMs?: number; nowMs?: number } = {},
): boolean {
  const now = opts.nowMs ?? Date.now();
  const ttl = opts.ttlMs ?? REFRESH_LEASE_TTL_MS;
  const all = leases(dataDir);
  const cur = all[key];
  if (cur && cur.expiresAt > now) {
    refreshContentionStats.contended++;
    refreshContentionStats.lastContention = `${key} (held by ${cur.owner})`;
    return false;
  }
  all[key] = { owner, acquiredAt: now, expiresAt: now + ttl };
  persistLeases(dataDir, all);
  return true;
}

/** Release our own lease (owner must match; never clears a foreign lease). */
export function releaseRefreshLease(dataDir: string, key: string, owner: string): void {
  const all = leases(dataDir);
  if (all[key] && all[key].owner === owner) {
    delete all[key];
    persistLeases(dataDir, all);
  }
}

/** One-shot non-throwing acquire/release convenience (finally-safe). */
export async function withRefreshLease<T>(
  dataDir: string,
  key: string,
  owner: string,
  fn: () => Promise<T>,
  opts: { ttlMs?: number } = {},
): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  if (!acquireRefreshLease(dataDir, key, owner, opts)) {
    return { ok: false, reason: `refresh lease for ${key} held by another owner (single-use token protected)` };
  }
  try {
    const value = await fn();
    return { ok: true, value };
  } finally {
    releaseRefreshLease(dataDir, key, owner);
  }
}