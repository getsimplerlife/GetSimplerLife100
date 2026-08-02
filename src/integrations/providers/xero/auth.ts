import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

const DEFAULT_XERO_SCOPES = ["openid", "profile", "email"];
// Full accounting scopes (enable in Xero Developer Portal first, then set OAUTH_XERO_SCOPES):
// "openid profile email offline_access accounting.invoices accounting.invoices.read accounting.banktransactions accounting.banktransactions.read accounting.settings accounting.settings.read accounting.contacts accounting.contacts.read"

export function getXeroOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  const scopeEnv = typeof process !== "undefined" && process.env?.OAUTH_XERO_SCOPES;
  const scopes = scopeEnv ? scopeEnv.split(" ").filter(Boolean) : DEFAULT_XERO_SCOPES;
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes, authorizeUrl: "https://login.xero.com/identity/connect/authorize", tokenUrl: "https://identity.xero.com/connect/token", flowType: "authorization_code", usePKCE: true };
}
export async function buildXeroAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getXeroOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleXeroCallback(config: any, code: string, verifier: string) { return exchangeCode(getXeroOAuthConfig(config), code, verifier); }
export async function refreshXeroToken(config: any, rt: string) { return refreshToken(getXeroOAuthConfig(config), rt); }
export { isTokenExpired as isXeroTokenExpired };