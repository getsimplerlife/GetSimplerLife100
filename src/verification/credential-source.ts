/**
 * Credential source for provider verification runs.
 *
 * Loads provider credentials from, in order:
 *   1. `--token <path>` raw token file (JSON credential object or raw access token)
 *   2. `.data/tenant_oauth_credentials.json` — token entries keyed `${email}:${provider}`
 *   3. Environment `OAUTH_<PROVIDER>_CLIENT_ID` / `OAUTH_<PROVIDER>_CLIENT_SECRET` for app creds
 *
 * This module performs no network calls. It never logs or prints credential values.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
    if (!parsed.accessToken && !parsed.apiToken) {
      throw new Error(`Token file ${path} is JSON but has no accessToken/apiToken`);
    }
    return parsed;
  }
  // Raw token (e.g. Xero access token captured during a manual flow).
  return { accessToken: text };
}

/**
 * Find a stored credential in `.data/tenant_oauth_credentials.json`.
 * Lookup order: `${tenant}:${provider}` exact, any key ending `:${provider}` (first tenant found),
 * then a bare `${provider}` app-level key.
 */
export function loadStoredCredential(
  provider: string,
  options: { tenant?: string; dataDir?: string } = {},
): { credential?: ProviderCredential; app?: OAuthAppCredentials; source: string } {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const credsFile = join(dataDir, "tenant_oauth_credentials.json");
  if (!existsSync(credsFile)) return { source: `no ${credsFile}` };

  let data: Record<string, ProviderCredential>;
  try {
    data = JSON.parse(readFileSync(credsFile, "utf8")) as Record<string, ProviderCredential>;
  } catch {
    return { source: `${credsFile} unreadable` };
  }

  const keys = Object.keys(data);
  const candidates: string[] = [];
  if (options.tenant && data[`${options.tenant}:${provider}`]) {
    candidates.push(`${options.tenant}:${provider}`);
  }
  candidates.push(...keys.filter((k) => k.endsWith(`:${provider}`)));
  candidates.push(...keys.filter((k) => k === provider));

  for (const key of candidates) {
    const entry = data[key];
    if (!entry) continue;
    if (entry.accessToken || entry.apiToken || entry.apiKey) {
      return { credential: entry, source: `${credsFile}#${key}` };
    }
  }
  return { source: `no ${provider} credential in ${credsFile}` };
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
  if (!parts.length) return "present but no usable token fields";
  return parts.join(", ");
}
