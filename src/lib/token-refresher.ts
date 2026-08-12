import { join } from "path";
import { readJSON, writeJSON } from "./data-store";

/**
 * token-refresher.ts — keep every OAuth client connection usable 24/7.
 *
 * WHY (audited 2026-08-12): the server was purely request-driven — nothing
 * ever called a provider's token endpoint, so access tokens silently expired
 * and connections died (Xero 23/26 and HubSpot 4/11 were dead for exactly
 * this reason; Slack survives only because bot tokens don't expire).
 *
 * This module sweeps the stored token entries (`tenant_oauth_credentials.json`,
 * keyed `${email}:${provider}`) and refreshes access tokens before expiry via
 * a per-provider registry of KNOWN token endpoints (audited in
 * `src/integrations/providers/<id>/auth.ts` — never guessed). Unknown
 * providers FAIL CLOSED: no registry entry ⇒ no network call, no fabricated
 * URL, entry skipped.
 *
 * Refresh policy:
 *  - With an expiry timestamp: refresh when the token is at/past ~70% of its
 *    lifetime (last 30% before expiry).
 *  - Without an expiry timestamp: refresh only when the stored token is older
 *    than a sane window (12h) — never churn fresh tokens.
 *  - On success the new accessToken (and new refreshToken, when the provider
 *    rotates it) is written through the existing connection write path
 *    (writeJSON → durable store when enabled) and the connection record is
 *    marked Connected with a fresh lastSync.
 *  - On failure the connection is marked auth_failed, the error is logged,
 *    and the sweep does NOT crash or hot-retry — the next hourly sweep backs
 *    off naturally.
 */

// ── Per-provider refresh registry ────────────────────────────────────────────
// Only providers with an audited token endpoint live here. Adding a provider
// requires its token endpoint to come from the repo's verified provider module.
export interface OAuthRefreshDef {
  /** OAuth 2.0 token endpoint (audited — never guessed). */
  tokenUrl: string;
  /** Extra form params if the provider requires them (e.g. scope). */
  extraParams?: Record<string, string>;
}

export const REFRESH_REGISTRY: Record<string, OAuthRefreshDef> = {
  // Audited: src/integrations/providers/xero/auth.ts → tokenUrl
  xero: { tokenUrl: "https://identity.xero.com/connect/token" },
  // Audited: src/integrations/providers/hubspot/auth.ts → tokenUrl
  hubspot: { tokenUrl: "https://api.hubapi.com/oauth/v1/token" },
  // Audited: src/integrations/providers/google-{drive,docs,sheets,slides,calendar}/auth.ts → tokenUrl
  "google-drive": { tokenUrl: "https://oauth2.googleapis.com/token" },
  "google-docs": { tokenUrl: "https://oauth2.googleapis.com/token" },
  "google-sheets": { tokenUrl: "https://oauth2.googleapis.com/token" },
  "google-slides": { tokenUrl: "https://oauth2.googleapis.com/token" },
  "google-calendar": { tokenUrl: "https://oauth2.googleapis.com/token" },
  // Audited: src/integrations/providers/microsoft-office/graph-auth.ts → tokenUrl
  // (multi-tenant "common" authority — refresh tokens issued for tenant-bound
  // authorities that fail here will surface as auth_failed and need re-auth)
  onedrive: { tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token" },
  "microsoft-word": { tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token" },
  "microsoft-excel": { tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token" },
  "microsoft-powerpoint": { tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token" },
};

/** True when this provider has an audited refresh path (fail-closed gate). */
export function isRefreshProvider(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(REFRESH_REGISTRY, providerId?.toLowerCase());
}

// ── Sweep policy constants ───────────────────────────────────────────────────
/** Refresh at/past 70% of the token's lifetime (last 30%). */
const LEAD_FRACTION = 0.3;
/** Floor for the lead window so short-lived tokens don't hammer the endpoint. */
const MIN_LEAD_SEC = 60;
/** Guard against nonsense lifetimes (clock skew etc.). */
const MIN_LIFETIME_SEC = 5 * 60;
/** Lead window when the issue time is unknown (conservative 1h). */
const DEFAULT_LEAD_SEC = 60 * 60;
/** No-expiry tokens refresh only after this age (12h). */
const NO_EXPIRY_REFRESH_AFTER_MS = 12 * 60 * 60 * 1000;

// ── Sweep stats (admin visibility: GET /api/admin/datadir) ──────────────────
export const tokenSweepStats = {
  lastSweep: 0,          // epoch ms of the last completed sweep
  nextSweep: 0,          // epoch ms the next sweep is due
  tokensRefreshed: 0,    // cumulative across sweeps since boot
  tokensFailed: 0,       // cumulative across sweeps since boot
  lastError: null as string | null,
};

export interface SweepResult {
  checked: number;
  refreshed: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/**
 * True when an entry's access token should be refreshed at `nowMs`.
 * Entries with a missing/unknown expiry and a recent updatedAt are left alone
 * (never churn a fresh token); unknown-age entries are left alone too (the
 * provider returns 401 if the token is truly dead — next connect flow fixes it).
 */
export function needsRefresh(entry: any, nowMs: number): boolean {
  if (!entry || typeof entry !== "object") return false;
  const rawExp = entry.expiresAt;
  const expiresAt = typeof rawExp === "number" ? rawExp : rawExp != null ? Number(rawExp) : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    // No expiry timestamp: refresh only once the stored token is stale.
    const updatedMs = entry.updatedAt ? Date.parse(entry.updatedAt) : NaN;
    if (!Number.isFinite(updatedMs)) return false; // unknown age — don't churn
    return nowMs - updatedMs >= NO_EXPIRY_REFRESH_AFTER_MS;
  }
  const updatedMs = entry.updatedAt ? Date.parse(entry.updatedAt) : NaN;
  const issuedSec = Number.isFinite(updatedMs) ? updatedMs / 1000 : undefined;
  let leadSec = DEFAULT_LEAD_SEC;
  if (issuedSec !== undefined && expiresAt > issuedSec + MIN_LIFETIME_SEC) {
    const lifetime = expiresAt - issuedSec;
    leadSec = Math.max(MIN_LEAD_SEC, lifetime * LEAD_FRACTION);
  }
  return nowMs / 1000 >= expiresAt - leadSec;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch seconds
  tokenType?: string;
  scope?: string;
}

/** Call a provider's token endpoint with grant_type=refresh_token. */
export async function refreshAccessToken(def: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  extraParams?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): Promise<RefreshedTokens> {
  const f = def.fetchImpl || fetch;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: def.refreshToken,
    client_id: def.clientId,
    client_secret: def.clientSecret,
  });
  for (const [k, v] of Object.entries(def.extraParams || {})) params.set(k, v);
  const res = await f(def.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data?.access_token) throw new Error("Token refresh returned no access_token");
  const out: RefreshedTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type || "Bearer",
    scope: data.scope,
  };
  if (data.expires_in) out.expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  else if (data.expires_at) out.expiresAt = Number(data.expires_at);
  return out;
}

/**
 * Resolve the OAuth client credentials used to refresh a provider's token —
 * same precedence as prod-server's getOAuthCredentials:
 *   1. env OAUTH_<PROVIDER>_CLIENT_ID/SECRET (or <PROVIDER>_CLIENT_ID/SECRET)
 *   2. tenant_oauth_credentials.json entry keyed by the provider name
 */
export function resolveOAuthClientCreds(
  provider: string,
  tokenData: Record<string, any>,
): { clientId: string; clientSecret: string } | null {
  const upper = provider.replace(/-/g, "_").toUpperCase();
  const clientId = process.env[`OAUTH_${upper}_CLIENT_ID`] || process.env[`${upper}_CLIENT_ID`];
  const clientSecret = process.env[`OAUTH_${upper}_CLIENT_SECRET`] || process.env[`${upper}_CLIENT_SECRET`];
  if (clientId && clientSecret) return { clientId, clientSecret };
  const credEntry = tokenData?.[provider];
  if (credEntry?.clientId && credEntry?.clientSecret) {
    return { clientId: credEntry.clientId, clientSecret: credEntry.clientSecret };
  }
  return null;
}

/**
 * Sweep every stored token entry and refresh the ones at/over the refresh
 * threshold. Writes go through the existing connection write path (writeJSON
 * → durable store when enabled). Never crashes; failures are counted and
 * surfaced via tokenSweepStats.
 */
export async function sweepExpiredTokens(
  dataDir: string,
  optsIn: { now?: number; fetchImpl?: typeof fetch } = {},
): Promise<SweepResult> {
  const now = optsIn.now ?? Date.now();
  const tokenFile = join(dataDir, "tenant_oauth_credentials.json");
  const connsFile = join(dataDir, "tenant_integrations.json");
  const tokenData = readJSON(tokenFile) || {};
  const allConns = readJSON(connsFile) || {};
  let refreshed = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [key, entry] of Object.entries<any>(tokenData)) {
    if (!entry || typeof entry !== "object") { skipped++; continue; }
    const provider = String(entry.provider || (key.includes(":") ? key.split(":")[1] : key)).toLowerCase();
    // Fail closed: no audited endpoint for this provider → never guess a URL.
    if (!isRefreshProvider(provider)) { skipped++; continue; }
    if (!entry.refreshToken) { skipped++; continue; }
    if (!needsRefresh(entry, now)) { skipped++; continue; }

    const creds = resolveOAuthClientCreds(provider, tokenData);
    if (!creds) {
      skipped++;
      errors.push(`${key}: no OAuth client credentials configured (OAUTH_${provider.toUpperCase()}_CLIENT_ID/SECRET or tenant_oauth_credentials.json[${provider}])`);
      continue;
    }

    const email = key.includes(":") ? key.split(":")[0] : "";
    try {
      const def = REFRESH_REGISTRY[provider];
      const tokens = await refreshAccessToken({
        tokenUrl: def.tokenUrl,
        extraParams: def.extraParams,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        refreshToken: entry.refreshToken,
        fetchImpl: optsIn.fetchImpl,
      });
      // Update the stored token entry (provider may rotate the refresh token).
      tokenData[key] = {
        ...entry,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || entry.refreshToken,
        expiresAt: tokens.expiresAt ?? entry.expiresAt,
        tokenType: tokens.tokenType || entry.tokenType,
        scope: tokens.scope || entry.scope,
        updatedAt: new Date(now).toISOString(),
      };
      // Update the connection record through the existing write path.
      const userConns = Array.isArray(allConns[email]) ? allConns[email] : [];
      const idx = userConns.findIndex((c: any) => c && (c.providerId === provider || c.provider === provider));
      if (idx >= 0) {
        userConns[idx] = {
          ...userConns[idx],
          status: "Connected",
          lastSync: new Date(now).toISOString(),
          connectedAt: userConns[idx].connectedAt || new Date(now).toISOString(),
          credentials: { ...(userConns[idx].credentials || {}), apiKey: tokens.accessToken, oauth: true },
        };
        allConns[email] = userConns;
      }
      refreshed++;
    } catch (e: any) {
      failed++;
      errors.push(`${key}: ${e?.message || String(e)}`);
      // Mark the connection auth_failed so the UI/API reflects reality.
      const userConns = Array.isArray(allConns[email]) ? allConns[email] : [];
      const idx = userConns.findIndex((c: any) => c && (c.providerId === provider || c.provider === provider));
      if (idx >= 0) {
        userConns[idx] = { ...userConns[idx], status: "auth_failed", lastSync: new Date(now).toISOString() };
        allConns[email] = userConns;
      }
    }
  }

  if (refreshed > 0 || failed > 0) {
    writeJSON(tokenFile, tokenData);
    writeJSON(connsFile, allConns);
  }

  tokenSweepStats.lastSweep = now;
  tokenSweepStats.tokensRefreshed += refreshed;
  tokenSweepStats.tokensFailed += failed;
  tokenSweepStats.lastError = errors.length ? errors.join(" | ").slice(0, 2000) : null;

  return { checked: Object.keys(tokenData).length, refreshed, failed, skipped, errors };
}
