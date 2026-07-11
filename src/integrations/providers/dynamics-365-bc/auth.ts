import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getBCOAuthConfig(config: { tenantId: string; clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: [`https://api.businesscentral.dynamics.com/.default`, "offline_access"], authorizeUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`, tokenUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, flowType: "authorization_code" };
}
export async function buildBCAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getBCOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleBCCallback(config: any, code: string, verifier: string) { return exchangeCode(getBCOAuthConfig(config), code, verifier); }
export async function refreshBCToken(config: any, rt: string) { return refreshToken(getBCOAuthConfig(config), rt); }
export { isTokenExpired as isBCTokenExpired };