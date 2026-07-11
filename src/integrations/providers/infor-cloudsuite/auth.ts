import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getInforOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; baseUrl: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["api"], authorizeUrl: `${config.baseUrl.replace(/\/+$/, "")}/mingle/oauth/authorize`, tokenUrl: `${config.baseUrl.replace(/\/+$/, "")}/mingle/oauth/token`, flowType: "authorization_code" };
}
export async function buildInforAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getInforOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleInforCallback(config: any, code: string, verifier: string) { return exchangeCode(getInforOAuthConfig(config), code, verifier); }
export async function refreshInforToken(config: any, rt: string) { return refreshToken(getInforOAuthConfig(config), rt); }
export { isTokenExpired as isInforTokenExpired };