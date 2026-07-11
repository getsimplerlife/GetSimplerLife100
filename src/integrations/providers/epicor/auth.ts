import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getEpicorOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; baseUrl: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["api"], authorizeUrl: `${config.baseUrl.replace(/\/+$/, "")}/api/v2/authorize`, tokenUrl: `${config.baseUrl.replace(/\/+$/, "")}/api/v2/token`, flowType: "authorization_code" };
}
export async function buildEpicorAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getEpicorOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleEpicorCallback(config: any, code: string, verifier: string) { return exchangeCode(getEpicorOAuthConfig(config), code, verifier); }
export async function refreshEpicorToken(config: any, rt: string) { return refreshToken(getEpicorOAuthConfig(config), rt); }
export { isTokenExpired as isEpicorTokenExpired };