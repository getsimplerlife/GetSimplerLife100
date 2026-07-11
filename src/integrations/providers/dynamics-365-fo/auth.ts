import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getFOOAuthConfig(config: { tenantId: string; clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: [`${config.clientId}/.default`, "offline_access"], authorizeUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`, tokenUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, flowType: "authorization_code" };
}
export async function buildFOAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getFOOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleFOCallback(config: any, code: string, verifier: string) { return exchangeCode(getFOOAuthConfig(config), code, verifier); }
export async function refreshFOToken(config: any, rt: string) { return refreshToken(getFOOAuthConfig(config), rt); }
export { isTokenExpired as isFOTokenExpired };