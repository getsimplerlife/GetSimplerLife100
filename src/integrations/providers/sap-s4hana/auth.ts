import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getSAPOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; authUrl: string; tokenUrl: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["api"], authorizeUrl: config.authUrl, tokenUrl: config.tokenUrl, flowType: "authorization_code" };
}

export async function buildSAPAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getSAPOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleSAPCallback(config: any, code: string, verifier: string) { return exchangeCode(getSAPOAuthConfig(config), code, verifier); }
export async function refreshSAPToken(config: any, rt: string) { return refreshToken(getSAPOAuthConfig(config), rt); }
export { isTokenExpired as isSAPTokenExpired };