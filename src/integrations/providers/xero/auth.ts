import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getXeroOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["openid", "profile", "email", "accounting.transactions", "accounting.settings", "accounting.contacts", "offline_access"], authorizeUrl: "https://login.xero.com/identity/connect/authorize", tokenUrl: "https://identity.xero.com/connect/token", flowType: "authorization_code", usePKCE: true };
}
export async function buildXeroAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getXeroOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleXeroCallback(config: any, code: string, verifier: string) { return exchangeCode(getXeroOAuthConfig(config), code, verifier); }
export async function refreshXeroToken(config: any, rt: string) { return refreshToken(getXeroOAuthConfig(config), rt); }
export { isTokenExpired as isXeroTokenExpired };