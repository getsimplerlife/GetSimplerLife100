import { join } from "path";
import { readJSON, readJSONLive, writeJSON, mergeDurableCredential } from "./data-store";

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
 *
 * The LIVE server uses startScheduledTokenRefresher() instead (below), which
 * adds:
 *  - FAST RETRY: a transient refresh failure is re-attempted immediately with
 *    short exponential backoff (5s → 15s → 45s), so a one-off provider blip
 *    never lingers into an actual connection close. reconnect_required
 *    (consumed/revoked token) is NOT retryable — it goes to the one-click
 *    re-consent path. Retries re-acquire the single-flight lease (no clash).
 *  - PRE-EMPTIVE RENEWAL: per-provider refresh-token tenure (REFRESH_TENURE_REGISTRY)
 *    rotates a refresh token well before a provider would age it out.
 *
 * HONESTY GUARDRAIL: this can never be a hard "never closes". Access/refresh
 * token lifetimes and revocation are the provider's domain. Even with fast
 * retry + pre-emptive renewal, a provider-issued short-lived or revoked token
 * (or a customer disconnecting at the provider) cannot and MUST NOT be forced.
 * When a refresh can't be renewed despite retries, the connection is kept in a
 * clearly-marked reconnect_required state (never deleted, never silently grey)
 * with a structured lastError + attempt history, and the owner (and opted-in
 * tenant) is alerted so re-authorization is one click and never silent.
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
  //
  // #231: scope MUST repeat the original grant. The provider modules request
  // ["Files.ReadWrite","offline_access"] (onedrive/auth.ts etc.); a refresh that
  // omits scope mints an MSA artifact token with NO Graph audience, which Graph
  // rejects with 401 UnknownError — and the old valid token was being destroyed
  // (silent connection loss). The scope here mirrors the module's audited grant.
  onedrive: {
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    extraParams: { scope: "Files.ReadWrite offline_access" },
  },
  "microsoft-word": {
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    extraParams: { scope: "Files.ReadWrite offline_access" },
  },
  "microsoft-excel": {
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    extraParams: { scope: "Files.ReadWrite offline_access" },
  },
  "microsoft-powerpoint": {
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    extraParams: { scope: "Files.ReadWrite offline_access" },
  },
  // Audited: src/integrations/providers/docusign/auth.ts → tokenUrl (authorization_code
  // grant; form-encoded client creds proven by the working connect token exchange)
  docusign: { tokenUrl: "https://account-d.docusign.com/oauth/token" },
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

// ── Per-provider refresh-token tenure (pre-emptive renewal) ──────────────────
// Some providers cap how long they honor a refresh token before it must be
// re-issued (security rotation, "inactive" windows, etc.). Even when the ACCESS
// token is still inside its lifetime, renewing via the normal refresh endpoint
// rotates the refresh token and keeps it from aging into a dead one. These are
// CONSERVATIVE documented estimates of how long a provider keeps a refresh token
// valid; we renew well before the cap. Only providers that permit standard
// refresh are listed — nothing here circumvents provider policy (an audited
// REFRESH_REGISTRY entry is still required to actually refresh).
export interface RefreshTenureDef {
  /** Approx. how long the provider honors a refresh token before it must be
   *  re-issued (ms). Conservative. */
  tenureMs: number;
  /** Fraction of tenure to leave as a renewal lead (renew early). */
  leadFraction: number;
}
export const REFRESH_TENURE_REGISTRY: Record<string, RefreshTenureDef> = {
  // Xero refresh tokens are single-use and valid ~60 days; we rotate on every
  // access refresh, so this is a guardrail for an access token with a very long
  // lifetime stalling refresh-token rotation.
  xero: { tenureMs: 60 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  hubspot: { tenureMs: 180 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  "google-drive": { tenureMs: 180 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  "google-docs": { tenureMs: 180 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  "google-sheets": { tenureMs: 180 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  "google-slides": { tenureMs: 180 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  "google-calendar": { tenureMs: 180 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  onedrive: { tenureMs: 90 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  "microsoft-word": { tenureMs: 90 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  "microsoft-excel": { tenureMs: 90 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  "microsoft-powerpoint": { tenureMs: 90 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
  docusign: { tenureMs: 90 * 24 * 60 * 60 * 1000, leadFraction: 0.2 },
};

/**
 * True when a credential's refresh token is nearing its provider tenure cap and
 * should be renewed early (even if the access token is not yet due) so it never
 * ages into a dead token. Only applies to providers with a structured tenure
 * entry. `updatedAt` is used as a proxy for when the refresh token was last
 * issued (it rotates on each access refresh for most providers).
 */
export function refreshTokenNearingTenure(entry: any, nowMs: number): boolean {
  if (!entry || typeof entry !== "object") return false;
  const provider = String(entry.provider || "").toLowerCase();
  const def = REFRESH_TENURE_REGISTRY[provider];
  if (!def) return false;
  const updatedMs = entry.updatedAt ? Date.parse(entry.updatedAt) : NaN;
  if (!Number.isFinite(updatedMs)) return false;
  const lead = def.tenureMs * def.leadFraction;
  return nowMs >= updatedMs + (def.tenureMs - lead);
}

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
  // Pre-emptive renewal: refresh before the provider's refresh-token tenure cap
  // so the refresh token never ages into a dead one (even if the access token is
  // not yet due). Rotating early is safe for every provider that permits
  // standard refresh (audited in REFRESH_TENURE_REGISTRY).
  if (refreshTokenNearingTenure(entry, nowMs)) return true;
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
  // #234 durable-first: scan the durable store directly (file/cache fallback)
  // so tokens persisted on another instance are refreshed, not missed.
  const tokenData = (await readJSONLive(tokenFile)) || {};
  const allConns = readJSON(connsFile) || {};
  let refreshed = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];
  const changedTokenKeys: string[] = []; // #235: keys this sweep changed

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
      changedTokenKeys.push(key);
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
    // #235 merge-on-write: persist ONLY the keys this sweep changed against the
    // CURRENT durable value so rows added by other instances (a fresh reconnect
    // on another live host) are never wiped by this sweep's older snapshot.
    if (changedTokenKeys.length > 0) {
      await mergeDurableCredential(tokenFile, changedTokenKeys.map((k) => ({ type: "set", key: k, value: tokenData[k] })));
    }
    writeJSON(connsFile, allConns);
  }

  tokenSweepStats.lastSweep = now;
  tokenSweepStats.tokensRefreshed += refreshed;
  tokenSweepStats.tokensFailed += failed;
  tokenSweepStats.lastError = errors.length ? errors.join(" | ").slice(0, 2000) : null;

  return { checked: Object.keys(tokenData).length, refreshed, failed, skipped, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// #230 connection-loss prevention (owner: "never lose a connection again")
// Scheduled, per-credential PROACTIVE refresher + single-writer locking +
// immediate rotation flush + failure classification + owner alert. The hourly
// blind sweep above remains for tests/back-compat; the live server uses
// startScheduledTokenRefresher() instead.
// ─────────────────────────────────────────────────────────────────────────────
import { drainPendingWrites } from "./durable-store";
import { acquireRefreshLease, releaseRefreshLease, REFRESH_LEASE_TTL_MS } from "./connection-refresh-lock";

/** Tick cadence for the due-based scheduler (60s). */
export const REFRESHER_TICK_MS = 60_000;
/** Catch-up window: also refresh creds that become due within the next tick. */
export const REFRESHER_LOOKAHEAD_MS = 120_000;
/** Health heartbeat + owner-alert throttling window for one provider:email. */
export const RECONNECT_ALERT_THROTTLE_MS = 6 * 60 * 60 * 1000;

// ── Fast-retry on transient refresh failure ─────────────────────────────────
// A transient blip (5xx from a provider, a one-off network error, a momentary
// 429) should never linger into an actual connection close. Instead of waiting
// for the next scheduled tick (60s), a transiently-failed refresh is re-attempted
// with short exponential backoff. Each retry re-acquires the single-flight lease,
// so retries never clash with each other or with a scheduled refresh. A refresh
// failing with reconnect_required (consumed/revoked token) is NOT retryable by
// code — it goes straight to the one-click re-consent path (no retry loop).
export const TRANSIENT_RETRY_DELAYS_MS = [5_000, 15_000, 45_000];
/** How often the retry scheduler wakes to process due retries. */
export const TRANSIENT_RETRY_POLL_MS = 2_000;

export interface TransientRetryState {
  attempt: number; // 0-based; index into TRANSIENT_RETRY_DELAYS_MS for the next delay
  nextAt: number;  // epoch ms when the retry is due (0 = immediate/now)
}

/** Pass to refreshOneCredential to report a retry (for structured stats). */
export const transientRetryStats = {
  scheduled: 0,
  attempted: 0,
  recovered: 0,
  exhausted: 0,
};

export interface RefreshOutcome {
  key: string;
  provider: string;
  email: string;
  refreshed: boolean;
  status: "ok" | "transient" | "reconnect_required" | "contended";
  error?: string;
}

/** Classify a refresh error: single-use token death is NOT retryable by code. */
export function classifyRefreshError(message: string): "transient" | "reconnect_required" {
  const m = (message || "").toLowerCase();
  if (/invalid_grant|refresh token has been consumed|revoked|expired refresh|token.*(revoked|expired|invalid)/.test(m)) {
    return "reconnect_required";
  }
  return "transient";
}

/** Precise next time a credential is due for a refresh (ms epoch). */
export function nextRefreshDueMs(entry: any, nowMs: number): number {
  if (!needsRefresh(entry, nowMs)) {
    const rawExp = entry?.expiresAt;
    const expiresAt = typeof rawExp === "number" ? rawExp : rawExp != null ? Number(rawExp) : NaN;
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
      const updatedMs = entry?.updatedAt ? Date.parse(entry.updatedAt) : NaN;
      if (!Number.isFinite(updatedMs)) return nowMs + 60 * 60 * 1000; // unknown → conservative 1h
      return updatedMs + NO_EXPIRY_REFRESH_AFTER_MS;
    }
    const updatedMs = entry?.updatedAt ? Date.parse(entry.updatedAt) : NaN;
    const issuedSec = Number.isFinite(updatedMs) ? updatedMs / 1000 : undefined;
    let leadSec = DEFAULT_LEAD_SEC;
    if (issuedSec !== undefined && expiresAt > issuedSec + MIN_LIFETIME_SEC) {
      leadSec = Math.max(MIN_LEAD_SEC, (expiresAt - issuedSec) * LEAD_FRACTION);
    }
    return Math.floor((expiresAt - leadSec) * 1000);
  }
  return nowMs;
}

export interface ScheduledRefresherStats {
  startedAt: number;
  tickCount: number;
  refreshed: number;
  transientFailures: number;
  reconnectRequired: number;
  alertsSent: number;
  lastTickAt: number;
  lastError: string | null;
}
export const scheduledRefresherStats: ScheduledRefresherStats = {
  startedAt: 0, tickCount: 0, refreshed: 0, transientFailures: 0,
  reconnectRequired: 0, alertsSent: 0, lastTickAt: 0, lastError: null,
};

export interface StoredOAuthEntry {
  provider: string;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number | string;
  updatedAt?: string;
  [k: string]: any;
}

interface AlertState { lastSentAt: number; lastReason: string; }
const alertThrottle = new Map<string, AlertState>();

export function reconnectAlertDue(key: string, nowMs: number, reason: string): boolean {
  const prev = alertThrottle.get(key);
  if (!prev) return true;
  if (nowMs - prev.lastSentAt >= RECONNECT_ALERT_THROTTLE_MS) return true;
  return prev.lastReason !== reason && nowMs - prev.lastSentAt >= 60_000; // new root cause → soon
}

export function noteAlertSent(key: string, reason: string, nowMs: number): void {
  alertThrottle.set(key, { lastSentAt: nowMs, lastReason: reason });
  while (alertThrottle.size > 500) {
    const oldest = alertThrottle.keys().next().value as string;
    alertThrottle.delete(oldest);
  }
}

/**
 * #233 owner decision (2026-08-19): reconnect-required alerts are sent to the
 * OWNER's inbox, not the tenant's email. Recipient resolution:
 *   OWNER_ALERT_EMAIL → SMTP_FROM (bare address; "Name <addr>" is parsed) →
 *   the connection's own email (last resort).
 * Live result: OWNER_ALERT_EMAIL is unset and SMTP_FROM=electric.vortexz@gmail.com,
 * so every ⚠️ reconnect alert lands in the owner's inbox (mathewortiz97@gmail.com
 * is the tenant the alert is ABOUT, referenced in the body).
 */
export function resolveOwnerAlertEmail(fallbackEmail: string): string {
  const raw = process.env.OWNER_ALERT_EMAIL || process.env.SMTP_FROM || fallbackEmail;
  const m = /^\s*(?:.*?)\s*<([^>]+)>\s*$/.exec(raw);
  return (m ? m[1] : raw).trim();
}

/** Send the owner reconnect-required alert via the repo's email path (throttled). */
export async function alertOwnerReconnectRequired(opts: {
  provider: string; email: string; reason: string; nowMs?: number;
  /** When the tenant is known to have an opted-in relationship (they authorized
   *  this connection), also notify them directly so it's never silent on their
   *  side. Only set for valid existing relationships — never cold-email. */
  notifyTenantEmail?: string;
  emailImpl?: (o: any) => Promise<{ ok?: boolean; success?: boolean; isMock?: boolean; error?: string }>;
}): Promise<boolean> {
  const now = opts.nowMs ?? Date.now();
  const key = `${opts.email}:${opts.provider}`;
  if (!reconnectAlertDue(key, now, opts.reason)) return false;
  const sender = opts.emailImpl ?? (async (o: any) => {
    const { sendEmail } = await import("../integrations/email");
    return sendEmail(o);
  });
  try {
    const res = await sender({
      // #233: TO is the owner's alert inbox (OWNER_ALERT_EMAIL → SMTP_FROM →
      // connection email); the tenant's email still identifies the connection
      // in the body below.
      to: [resolveOwnerAlertEmail(opts.email)],
      subject: `⚠️ ${opts.provider} connection needs reauthorization`,
      text:
        `Simpler Life 100 lost its ${opts.provider} connection for ${opts.email}.\n\n` +
        `Reason: ${opts.reason}\n\n` +
        `Fix: open the portal → Integrations → ${opts.provider} → Connect (one click). ` +
        `The connection stays dead until reauthorized; all ${opts.provider} automations are paused.`,
    });
    // #231: the repo's real sendEmail resolves { success, isMock } — NOT { ok }.
    // Only counting `ok` meant noteAlertSent never ran for the default path, so
    // the 6h throttle never engaged and the mock alert fired every cycle
    // (32 simulated sends, zero real deliveries). Accept either shape.
    const sent = Boolean(res?.ok ?? res?.success);
    if (sent) noteAlertSent(key, opts.reason, now);
    // Also notify the tenant directly when we have a valid opted-in relationship
    // (they authorized this connection) — service message about their own
    // account, never a cold solicitation. This is best-effort and not throttled
    // separately: the owner alert is the authoritative throttle.
    if (opts.notifyTenantEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(opts.notifyTenantEmail)) {
      try {
        await sender({
          to: [opts.notifyTenantEmail],
          subject: `Action needed: reconnect your ${opts.provider} integration`,
          text:
            `Your ${opts.provider} integration in your Simpler Life 100 portal needs to be reconnected.\n\n` +
            `Reason: ${opts.reason}\n\n` +
            `Fix (one click): open your portal → Integrations → ${opts.provider} → Connect.\n` +
            `Until you reconnect, your ${opts.provider} automations are paused.`,
        });
      } catch {
        // best-effort — the owner alert already fired
      }
    }
    return sent;
  } catch {
    return false;
  }
}

/**
 * Validate a freshly-refreshed access token BEFORE it replaces the stored one.
 * #231: the token endpoint can return HTTP 200 with an unusable token (the live
 * heartbeat proved it — Graph 401 UnknownError on a "successfully refreshed"
 * Files-scoped token). A refresher must NEVER replace a working token with one
 * the provider itself rejects. Inject the audited probe (connection-health →
 * probeProvider) so this module avoids a circular import.
 */
export type RefreshTokenValidator = (
  provider: string,
  accessToken: string,
  entry: Record<string, any>,
) => Promise<{ ok: boolean; httpStatus?: number; error?: string }>;

/**
 * Refresh ONE stored credential entry in place with single-writer discipline.
 * Returns the outcome; on success the rotated tokens (access + refresh) are
 * written through writeJSON and an IMMEDIATE durable flush is fired so the
 * single-use rotation reaches Neon without the ≤10-min background window.
 * When `opts.validateToken` is provided it MUST pass before the new token is
 * persisted — otherwise the previous (working) token is retained and the
 * failure is recorded loudly (fail-closed, #231).
 */
export async function refreshOneCredential(
  dataDir: string,
  tokenData: Record<string, StoredOAuthEntry>,
  connsByEmail: Record<string, any[]>,
  key: string,
  opts: { now?: number; fetchImpl?: typeof fetch; flushNow?: boolean; leaseOwner?: string; validateToken?: RefreshTokenValidator } = {},
): Promise<RefreshOutcome> {
  const now = opts.now ?? Date.now();
  const entry = tokenData[key];
  const provider = String(entry.provider || (key.includes(":") ? key.split(":")[1] : key)).toLowerCase();
  const email = key.includes(":") ? key.split(":")[0] : "";
  // SINGLE-FLIGHT (#230, Xero incident): only ONE process may refresh a given
  // single-use refresh token. Claim the durable lease first; if a foreign owner
  // holds it, report CONTENTION (recorded, never a silent consumed-token loss)
  // and do NOT touch the token.
  const leaseOwner = opts.leaseOwner ?? `sweeper:${process.pid ?? "?"}`;
  // SINGLE-FLIGHT (#230, Xero incident; P0 #2ecd8f): only ONE process/instance
  // may refresh a given single-use refresh token. The lease is an ATOMIC
  // durable acquire (cross-instance) when the store is enabled; if a foreign
  // owner holds it, report CONTENTION (recorded, never a silent consumed-token
  // loss) and do NOT touch the token.
  if (!(await acquireRefreshLease(dataDir, key, leaseOwner, { ttlMs: REFRESH_LEASE_TTL_MS }))) {
    return { key, provider, email, refreshed: false, status: "contended", error: "single-use token protected: refresh lease held by another owner" };
  }
  const release = async () => { await releaseRefreshLease(dataDir, key, leaseOwner); };
  if (!isRefreshProvider(provider) || !entry.refreshToken) {
    await release();
    return { key, provider, email, refreshed: false, status: "transient", error: "no refresh path" };
  }
  const creds = resolveOAuthClientCreds(provider, tokenData as any);
  if (!creds) {
    await release();
    return { key, provider, email, refreshed: false, status: "transient", error: "no OAuth client creds configured" };
  }
  try {
    const def = REFRESH_REGISTRY[provider];
    // RE-READ the live credential at refresh time (P0 #2ecd8f): the caller's
    // tokenData is a snapshot taken at tick start. If another instance already
    // rotated this single-use token, the LIVE refreshToken is the valid one and
    // the snapshot may hold a token that is already consumed. Using the freshest
    // durable value prevents a stale-token refresh (which is exactly the
    // "Refresh token has been consumed" cascade seen live on Xero).
    const liveTokenFile = join(dataDir, "tenant_oauth_credentials.json");
    const liveStore = ((await readJSONLive(liveTokenFile)) as Record<string, any> | null) || {};
    const liveEntry = liveStore[key] && typeof liveStore[key] === "object" ? (liveStore[key] as Record<string, any>) : entry;
    const refreshTokenToUse = typeof liveEntry.refreshToken === "string" ? (liveEntry.refreshToken as string) : (entry.refreshToken as string);
    const tokens = await refreshAccessToken({
      tokenUrl: def.tokenUrl, extraParams: def.extraParams,
      clientId: creds.clientId, clientSecret: creds.clientSecret,
      refreshToken: refreshTokenToUse, fetchImpl: opts.fetchImpl,
    });
    // #231 validate-before-replace: run the audited probe against the NEW token
    // before it can overwrite the stored one. If the provider rejects the token
    // (e.g. Graph 401 UnknownError on a scoped token), KEEP the previous token,
    // record the failure loudly, and do NOT rotate the store. A 200 from the
    // token endpoint is not proof the token works.
    if (opts.validateToken) {
      const validation = await opts.validateToken(provider, tokens.accessToken, liveEntry as any);
      if (!validation?.ok) {
        const msg = `refreshed token REJECTED by provider (${validation?.httpStatus ?? "n/a"} ${validation?.error ?? ""}) — previous token RETAINED`;
        console.error(`[connection-refresher] ⚠️ ${msg} provider=${provider} tenant=${email || "?"}`);
        const userConns = Array.isArray(connsByEmail[email]) ? connsByEmail[email] : [];
        const idx = userConns.findIndex((c: any) => c && (c.providerId === provider || c.provider === provider));
        if (idx >= 0) {
          userConns[idx] = {
            ...userConns[idx],
            status: "auth_failed",
            lastSync: new Date(now).toISOString(),
            lastRefreshError: msg.slice(0, 300),
            refreshFailedAt: new Date(now).toISOString(),
          };
          connsByEmail[email] = userConns;
          writeJSON(join(dataDir, "tenant_integrations.json"), connsByEmail);
        }
        scheduledRefresherStats.transientFailures++;
        scheduledRefresherStats.lastError = msg.slice(0, 300);
        void drainPendingWrites().catch(() => {});
        await release();
        return { key, provider, email, refreshed: false, status: "transient", error: msg };
      }
    }
    tokenData[key] = {
      ...(liveEntry as Record<string, any>),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || (liveEntry.refreshToken as string) || entry.refreshToken,
      expiresAt: tokens.expiresAt ?? (liveEntry.expiresAt ?? entry.expiresAt),
      tokenType: tokens.tokenType || liveEntry.tokenType || entry.tokenType,
      scope: tokens.scope || liveEntry.scope || entry.scope,
      updatedAt: new Date(now).toISOString(),
    };
    const userConns = Array.isArray(connsByEmail[email]) ? connsByEmail[email] : [];
    const idx = userConns.findIndex((c: any) => c && (c.providerId === provider || c.provider === provider));
    if (idx >= 0) {
      userConns[idx] = { ...userConns[idx], status: "Connected", lastSync: new Date(now).toISOString() };
      connsByEmail[email] = userConns;
    }
    writeJSON(join(dataDir, "tenant_integrations.json"), connsByEmail);
    // #235 merge-on-write: persist ONLY this refreshed key against the CURRENT
    // durable value (readJSONLive inside the helper). The caller's tokenData is
    // a snapshot taken at tick start — writing it wholesale would erase any row
    // another instance added since (e.g. the owner's fresh Xero reconnect).
    await mergeDurableCredential(join(dataDir, "tenant_oauth_credentials.json"), [{ type: "set", key, value: tokenData[key] }]);
    if (opts.flushNow !== false) void drainPendingWrites().catch(() => {});
    scheduledRefresherStats.refreshed++;
    await release();
    return { key, provider, email, refreshed: true, status: "ok" };
  } catch (e: any) {
    const msg = e?.message || String(e);
    const cls = classifyRefreshError(msg);
    const userConns = Array.isArray(connsByEmail[email]) ? connsByEmail[email] : [];
    const idx = userConns.findIndex((c: any) => c && (c.providerId === provider || c.provider === provider));
    if (idx >= 0) {
      userConns[idx] = {
        ...userConns[idx],
        status: cls === "reconnect_required" ? "reconnect_required" : "auth_failed",
        lastSync: new Date(now).toISOString(),
        lastRefreshError: msg.slice(0, 300),
        refreshFailedAt: new Date(now).toISOString(),
      };
      connsByEmail[email] = userConns;
      writeJSON(join(dataDir, "tenant_integrations.json"), connsByEmail);
    }
    if (cls === "reconnect_required") {
      scheduledRefresherStats.reconnectRequired++;
      // LOUD per-provider failure line (owner: "loud per-provider failure logs")
      console.error(
        `[connection-refresher] 🔴 RECONNECT REQUIRED provider=${provider} tenant=${email || "?"} reason="${msg.slice(0, 160)}" — automations for this provider are PAUSED until reauthorized`,
      );
      const sent = await alertOwnerReconnectRequired({
        provider, email: email || "mathewortiz97@gmail.com", reason: msg,
        notifyTenantEmail: email && email !== "mathewortiz97@gmail.com" ? email : undefined,
      });
      if (sent) scheduledRefresherStats.alertsSent++;
      void drainPendingWrites().catch(() => {});
    } else {
      scheduledRefresherStats.transientFailures++;
      console.error(`[connection-refresher] ⚠️ transient refresh failure provider=${provider} tenant=${email || "?"} reason="${msg.slice(0, 160)}" (scheduling fast backoff retry)`);
    }
    await release();
    return { key, provider, email, refreshed: false, status: cls, error: msg };
  }
}

export interface ScheduledRefresherHandle {
  stop: () => void;
  runTick: () => Promise<{ due: number; outcomes: RefreshOutcome[] }>;
  /** Process any fast-backoff retries whose window has arrived (testable hook;
   *  also driven by an internal poll in production). */
  runRetries: () => Promise<void>;
}

function isRefreshableKey(entry: any): boolean {
  return Boolean(entry && typeof entry === "object" && entry.refreshToken) &&
    isRefreshProvider(String(entry.provider || ""));
}

/**
 * Due-based scheduler: every REFRESHER_TICK_MS, refresh exactly the credentials
 * whose refresh window has arrived (needsRefresh + lookahead). A boot catch-up
 * and an hourly catch-up cover anything missed while down. Per-key refreshes
 * run sequentially and never overlap (single-writer rule).
 */
export function startScheduledTokenRefresher(
  dataDir: string,
  opts: { tickMs?: number; now?: () => number; fetchImpl?: typeof fetch; onTick?: () => void; validateToken?: RefreshTokenValidator } = {},
): ScheduledRefresherHandle {
  const tickMs = opts.tickMs ?? REFRESHER_TICK_MS;
  const inFlight = new Set<string>();
  const retryQueue = new Map<string, TransientRetryState>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  scheduledRefresherStats.startedAt = Date.now();

  // Run ONE credential refresh, record the outcome, and (on a transient
  // failure) schedule a fast backoff retry. Shared by the scheduled tick and
  // the retry poll so both honor single-flight + the retry policy.
  async function refreshOneWithRetry(
    key: string,
    tokenData: Record<string, StoredOAuthEntry>,
    conns: Record<string, any[]>,
    now: number,
    retryAttempt: number, // 0 for a fresh scheduled pass, else 1-based retry
  ): Promise<RefreshOutcome> {
    inFlight.add(key);
    try {
      const outcome = await refreshOneCredential(dataDir, tokenData, conns, key, {
        now, fetchImpl: opts.fetchImpl, flushNow: true, validateToken: opts.validateToken,
        leaseOwner: `sweeper:${process.pid ?? "?"}:${retryAttempt > 0 ? "retry" : "tick"}`,
      });
      if (retryAttempt > 0) transientRetryStats.attempted++;
      if (outcome.status === "transient" && !outcome.refreshed) {
        // Schedule/advance a fast retry. reconnect_required is NOT retryable —
        // it goes straight to the one-click re-consent path. The backoff delay
        // is indexed by how many attempts have already failed (retryAttempt):
        // first failure schedules 5s, next 15s, next 45s, then exhausted.
        if (retryAttempt < TRANSIENT_RETRY_DELAYS_MS.length) {
          retryQueue.set(key, { attempt: retryAttempt + 1, nextAt: now + TRANSIENT_RETRY_DELAYS_MS[retryAttempt] });
          transientRetryStats.scheduled++;
        } else {
          retryQueue.delete(key);
          transientRetryStats.exhausted++;
        }
      } else if (outcome.status !== "contended") {
        // Success, reconnect_required, or exhausted — clear any pending retry.
        if (retryQueue.delete(key) && outcome.refreshed) transientRetryStats.recovered++;
      }
      return outcome;
    } finally {
      inFlight.delete(key);
    }
  }

  // Process retries whose backoff window has arrived.
  async function processRetries(forceNow: number): Promise<void> {
    for (const [key, state] of Array.from(retryQueue.entries())) {
      if (stopped) break;
      if (inFlight.has(key)) continue; // a scheduled tick owns it — retry next poll
      if (state.nextAt > forceNow) continue; // still backing off
      retryQueue.delete(key);
      const tokenData = ((await readJSONLive(join(dataDir, "tenant_oauth_credentials.json"))) as Record<string, StoredOAuthEntry> | undefined) || {};
      const conns = (readJSON(join(dataDir, "tenant_integrations.json")) as Record<string, any[]> | undefined) || {};
      await refreshOneWithRetry(key, tokenData, conns, forceNow, state.attempt);
    }
  }

  async function runTick(): Promise<{ due: number; outcomes: RefreshOutcome[] }> {
    const now = opts.now ? opts.now() : Date.now();
    const tokenFile = join(dataDir, "tenant_oauth_credentials.json");
    // #234 durable-first: the tick must see tokens persisted on other
    // instances (OAuth callback) even when this instance's cache/file predate
    // them — otherwise a reconnect appears healthy on the writer and dead here.
    const tokenData = ((await readJSONLive(tokenFile)) as Record<string, StoredOAuthEntry> | undefined) || {};
    const conns = (readJSON(join(dataDir, "tenant_integrations.json")) as Record<string, any[]> | undefined) || {};
    const dueKeys: string[] = [];
    for (const [key, entry] of Object.entries<any>(tokenData)) {
      if (!isRefreshableKey(entry)) continue;
      if (inFlight.has(key)) continue; // single-writer: never overlap a refresh
      const provider = String(entry.provider || (key.includes(":") ? key.split(":")[1] : key));
      if (now >= nextRefreshDueMs(entry, now)) {
        dueKeys.push(key);
        void provider;
      }
    }
    const outcomes: RefreshOutcome[] = [];
    // Sequential refreshes (event loop awaits each) — never parallel per key.
    for (const key of dueKeys.sort()) {
      if (stopped) break;
      outcomes.push(await refreshOneWithRetry(key, tokenData, conns, now, 0));
    }
    scheduledRefresherStats.tickCount++;
    scheduledRefresherStats.lastTickAt = Date.now();
    if (opts.onTick) opts.onTick();
    return { due: dueKeys.length, outcomes };
  }

  // Boot catch-up runs immediately (refreshes anything already due).
  const boot = runTick().then((r) => {
    if (r.due > 0 || r.outcomes.some((o) => !o.refreshed)) {
      console.log(`[connection-refresher] boot catch-up: due=${r.due} refreshed=${r.outcomes.filter((o) => o.refreshed).length} failed=${r.outcomes.filter((o) => !o.refreshed).length}`);
    }
  }).catch((e: any) => { scheduledRefresherStats.lastError = String(e?.message || e); });

  timer = setInterval(() => {
    if (stopped) return;
    runTick().catch((e: any) => {
      scheduledRefresherStats.lastError = String(e?.message || e);
      console.error("[connection-refresher] tick error: " + String(e?.message || e));
    });
  }, tickMs);
  if (typeof (timer as any)?.unref === "function") (timer as any).unref();

  // Fast-retry poll: wakes frequently but only does work when a retry is due.
  retryTimer = setInterval(() => {
    if (stopped) return;
    const now = opts.now ? opts.now() : Date.now();
    if (retryQueue.size === 0) return;
    processRetries(now).catch((e: any) => {
      scheduledRefresherStats.lastError = String(e?.message || e);
      console.error("[connection-refresher] retry error: " + String(e?.message || e));
    });
  }, TRANSIENT_RETRY_POLL_MS);
  if (typeof (retryTimer as any)?.unref === "function") (retryTimer as any).unref();

  return {
    stop: () => { stopped = true; if (timer) clearInterval(timer); if (retryTimer) clearInterval(retryTimer); },
    runTick: async () => { await boot; return runTick(); },
    runRetries: async () => {
      const now = opts.now ? opts.now() : Date.now();
      if (retryQueue.size === 0) return;
      await processRetries(now);
    },
  };
}
