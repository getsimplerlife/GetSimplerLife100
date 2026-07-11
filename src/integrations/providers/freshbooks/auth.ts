import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getFBOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["user:profile", "accounting:invoices_read", "accounting:invoices_write", "accounting:clients_read", "accounting:clients_write"], authorizeUrl: "https://auth.freshbooks.com/oauth/authorize", tokenUrl: "https://auth.freshbooks.com/oauth/token", flowType: "authorization_code" };
}
export async function buildFBAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getFBOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleFBCallback(config: any, code: string, verifier: string) { return exchangeCode(getFBOAuthConfig(config), code, verifier); }
export async function refreshFBToken(config: any, rt: string) { return refreshToken(getFBOAuthConfig(config), rt); }
export { isTokenExpired as isFBTokenExpired };