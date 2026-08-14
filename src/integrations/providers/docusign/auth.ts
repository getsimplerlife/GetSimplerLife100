import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getDocuSignOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; accountId?: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["signature", "impersonation"], authorizeUrl: "https://account-d.docusign.com/oauth/auth", tokenUrl: "https://account-d.docusign.com/oauth/token", flowType: "authorization_code", usePKCE: true };
}
export async function buildDocuSignAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getDocuSignOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleDocuSignCallback(config: any, code: string, verifier: string) { return exchangeCode(getDocuSignOAuthConfig(config), code, verifier); }
export async function refreshDocuSignToken(config: any, rt: string) { return refreshToken(getDocuSignOAuthConfig(config), rt); }
export { isTokenExpired as isDocuSignTokenExpired };
/** Canonical DocuSign OAuth userinfo hosts (production + developer sandbox). No guessed hosts. */
export const DOCUSIGN_USERINFO_HOSTS = ["account.docusign.com", "account-d.docusign.com"] as const;
/**
 * Normalize a userinfo `base_uri` into the DocuSign REST API base URL
 * (`https://<host>/restapi`). The client appends `/v2.1/accounts/<id>`.
 * Only the canonical scheme/host from userinfo is used — no guessed hosts.
 */
export function docusignApiBaseUrl(baseUri: string | undefined): string {
  const raw = (baseUri || "").trim().replace(/\/+$/, "");
  if (!raw) return "https://demo.docusign.net/restapi";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.endsWith("/restapi") ? withScheme : `${withScheme}/restapi`;
}
/** Pick the default account from a userinfo `accounts` array; falls back to the first account. */
export function pickDefaultAccount(accounts: Array<{ account_id?: string; is_default?: boolean; base_uri?: string }>): { accountId: string; baseUri: string } | undefined {
  if (!Array.isArray(accounts) || accounts.length === 0) return undefined;
  const chosen = accounts.find((a) => a.is_default) ?? accounts[0];
  if (!chosen?.account_id) return undefined;
  return { accountId: chosen.account_id, baseUri: chosen.base_uri || "" };
}
/**
 * Resolve the default DocuSign account via GET /oauth/userinfo (canonical hosts only).
 * Returns `{ accountId, baseUri }` or throws when no usable account exists.
 */
export async function resolveDocuSignDefaultAccount(tokens: { accessToken?: string }): Promise<{ accountId: string; baseUri: string }> {
  if (!tokens.accessToken) throw new Error("DocuSign access token is required to resolve the default account");
  let lastError: unknown;
  for (const host of DOCUSIGN_USERINFO_HOSTS) {
    try {
      const res = await fetch(`https://${host}/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { accounts?: Array<{ account_id?: string; is_default?: boolean; base_uri?: string }> };
      const picked = pickDefaultAccount(data.accounts ?? []);
      if (picked) return picked;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`DocuSign userinfo returned no usable account (last error: ${String(lastError ?? "no host succeeded")})`);
}