import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getHSAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["signature_request", "basic_account_info", "team_read", "files_download"], authorizeUrl: "https://app.hellosign.com/oauth/authorize", tokenUrl: "https://api.hellosign.com/v3/oauth/token", flowType: "authorization_code" };
}
export async function buildHSAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getHSAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleHSCallback(config: any, code: string, verifier: string) { return exchangeCode(getHSAuthConfig(config), code, verifier); }
export async function refreshHSToken(config: any, rt: string) { return refreshToken(getHSAuthConfig(config), rt); }
export { isTokenExpired as isHSTokenExpired };