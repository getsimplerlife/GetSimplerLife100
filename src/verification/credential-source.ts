/**
 * Credential source for provider verification runs.
 *
 * Loads provider credentials from, in order:
 *   1. `--token <path>` raw token file (JSON credential object or raw access token)
 *   2. The durable store (Neon kv_store key `tenant_oauth_credentials.json`) — token
 *      entries keyed `${email}:${provider}`. Preferred because the live host's
 *      filesystem is recreated on every publish, so the file layer is ephemeral there.
 *   3. `.data/tenant_oauth_credentials.json` — same shape, used as a fallback (tests,
 *      local dev without a database, or a fresh process where the store is disabled)
 *   4. Environment `OAUTH_<PROVIDER>_CLIENT_ID` / `OAUTH_<PROVIDER>_CLIENT_SECRET` for app creds
 *
 * This module performs no network calls. It never logs or prints credential values.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { durableGet } from "../lib/durable-store";

export interface ProviderCredential {
  provider?: string;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
  instanceUrl?: string;
  /** Xero tenant id, Jira cloudId, DocuSign accountId etc. when captured at connect time. */
  tenantId?: string;
  cloudId?: string;
  accountId?: string;
  baseUrl?: string;
  apiToken?: string;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  [key: string]: unknown;
}

export interface OAuthAppCredentials {
  clientId: string;
  clientSecret: string;
}

export interface LoadedCredentials {
  /** The tenant-bound token/credential, if any. */
  credential?: ProviderCredential;
  /** OAuth app credentials (client id/secret) for token refresh, if configured. */
  app?: OAuthAppCredentials;
  /** Human-readable description of which source was used. */
  source: string;
}

const DEFAULT_DATA_DIR = join(process.cwd(), ".data");

export function envKeyFor(provider: string, suffix: "CLIENT_ID" | "CLIENT_SECRET"): string {
  const provUpper = provider.replace(/-/g, "_").toUpperCase();
  return `OAUTH_${provUpper}_${suffix}`;
}

/** Load OAuth app credentials from env vars (production convention: OAUTH_<PROVIDER>_CLIENT_ID/SECRET). */
export function loadOAuthAppCredentials(provider: string): OAuthAppCredentials | undefined {
  const clientId = process.env[envKeyFor(provider, "CLIENT_ID")];
  const clientSecret = process.env[envKeyFor(provider, "CLIENT_SECRET")];
  if (clientId && clientSecret) return { clientId, clientSecret };
  return undefined;
}

/** Read a `--token` file: either a JSON credential object or a raw access token string. */
export function loadTokenFile(path: string): ProviderCredential {
  const text = readFileSync(path, "utf8").trim();
  if (!text) throw new Error(`Token file is empty: ${path}`);
  if (text.startsWith("{")) {
    const parsed = JSON.parse(text) as ProviderCredential;
    if (!parsed.accessToken && !parsed.apiToken && !(parsed.user && parsed.password)) {
      throw new Error(`Token file ${path} is JSON but has no accessToken/apiToken/basic-auth user+password`);
    }
    return parsed;
  }
  // Raw token (e.g. Xero access token captured during a manual flow).
  return { accessToken: text };
}

/**
 * Find a stored credential, preferring the durable store (Neon) and falling
 * back to `.data/tenant_oauth_credentials.json` for tests / local dev.
 * Lookup order (same for both sources): `${tenant}:${provider}` exact, any key
 * ending `:${provider}` (first tenant found), then a bare `${provider}` key.
 */
export function loadStoredCredential(
  provider: string,
  options: { tenant?: string; dataDir?: string } = {},
): { credential?: ProviderCredential; app?: OAuthAppCredentials; source: string } {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const credsFile = join(dataDir, "tenant_oauth_credentials.json");

  // 1. Prefer the durable store. On the live host no file path survives a
  //    publish, so the DB is the only place the tenant tokens actually live.
  //    (durableGet returns undefined when the store is disabled — e.g. a
  //    local run without DATABASE_URL — and we fall through to the file.)
  const durableData = durableGet("tenant_oauth_credentials.json") as
    | Record<string, ProviderCredential>
    | undefined;
  if (durableData && typeof durableData === "object") {
    const hit = findCredentialEntry(durableData, provider, options.tenant);
    if (hit) return { credential: hit.entry, source: `durable:tenant_oauth_credentials.json#${hit.key}` };
  }

  // 2. Fall back to the on-disk store (tests / local dev without a DB).
  if (!existsSync(credsFile)) return { source: `no ${credsFile}` };

  let data: Record<string, ProviderCredential>;
  try {
    data = JSON.parse(readFileSync(credsFile, "utf8")) as Record<string, ProviderCredential>;
  } catch {
    return { source: `${credsFile} unreadable` };
  }

  const hit = findCredentialEntry(data, provider, options.tenant);
  if (hit) return { credential: hit.entry, source: `${credsFile}#${hit.key}` };
  return { source: `no ${provider} credential in ${credsFile}` };
}

/** Shared tenant-scoped lookup used for both the durable store and the file. */
function findCredentialEntry(
  data: Record<string, ProviderCredential>,
  provider: string,
  tenant?: string,
): { key: string; entry: ProviderCredential } | undefined {
  const keys = Object.keys(data);
  const candidates: string[] = [];
  if (tenant && data[`${tenant}:${provider}`]) candidates.push(`${tenant}:${provider}`);
  candidates.push(...keys.filter((k) => k.endsWith(`:${provider}`)));
  candidates.push(...keys.filter((k) => k === provider));
  for (const key of candidates) {
    const entry = data[key];
    if (!entry) continue;
    if (entry.accessToken || entry.apiToken || entry.apiKey || (entry.user && entry.password)) {
      return { key, entry };
    }
  }
  return undefined;
}

/** Convenience loader used by the batch runner. */
export function loadProviderCredentials(
  provider: string,
  options: { tokenFile?: string; tenant?: string; dataDir?: string } = {},
): LoadedCredentials {
  if (options.tokenFile) {
    const credential = loadTokenFile(options.tokenFile);
    return { credential, app: loadOAuthAppCredentials(provider), source: options.tokenFile };
  }
  const stored = loadStoredCredential(provider, { tenant: options.tenant, dataDir: options.dataDir });
  if (stored.credential) {
    return {
      credential: stored.credential,
      app: stored.app ?? loadOAuthAppCredentials(provider),
      source: stored.source,
    };
  }
  // ── Provider-specific env-var fallbacks for bot tokens / non-OAuth credentials ──
  if (provider === "slack") {
    const botToken = process.env.SLACK_BOT_TOKEN;
    if (botToken) {
      return { credential: { accessToken: botToken }, source: "env SLACK_BOT_TOKEN" };
    }
  }
  return { app: loadOAuthAppCredentials(provider), source: stored.source };
}

/** Report token freshness without printing the token. */
export function describeCredential(cred: ProviderCredential | undefined): string {
  if (!cred) return "none";
  const hasAccess = Boolean(cred.accessToken);
  const hasApi = Boolean(cred.apiToken || cred.apiKey);
  const parts: string[] = [];
  if (hasAccess) {
    const exp = typeof cred.expiresAt === "number" ? cred.expiresAt : undefined;
    parts.push(exp ? `access token (expires ${new Date(exp * 1000).toISOString()})` : "access token");
  }
  if (hasApi) parts.push("api token/key");
  if (cred.refreshToken) parts.push("refresh token");
  if (cred.user && cred.password) parts.push(`basic auth (user: ${cred.user})`);
  if (!parts.length) return "present but no usable token fields";
  return parts.join(", ");
}
