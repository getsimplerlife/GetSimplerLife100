import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getAsanaOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["default", "openid", "email", "profile"], authorizeUrl: "https://app.asana.com/-/oauth_authorize", tokenUrl: "https://app.asana.com/-/oauth_token", flowType: "authorization_code" };
}
export async function buildAsanaAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getAsanaOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleAsanaCallback(config: any, code: string, verifier: string) { return exchangeCode(getAsanaOAuthConfig(config), code, verifier); }
export async function refreshAsanaToken(config: any, rt: string) { return refreshToken(getAsanaOAuthConfig(config), rt); }
export { isTokenExpired as isAsanaTokenExpired };