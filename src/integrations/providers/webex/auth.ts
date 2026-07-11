import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getWebexOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["spark:all", "spark:admin_people_read", "spark:admin_rooms_read", "spark:admin_rooms_write", "spark:admin_messages_read", "spark:admin_messages_write", "spark:admin_meetings_read", "spark:admin_meetings_write"], authorizeUrl: "https://webexapis.com/v1/authorize", tokenUrl: "https://webexapis.com/v1/access_token", flowType: "authorization_code" };
}
export async function buildWebexAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getWebexOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleWebexCallback(config: any, code: string, verifier: string) { return exchangeCode(getWebexOAuthConfig(config), code, verifier); }
export async function refreshWebexToken(config: any, rt: string) { return refreshToken(getWebexOAuthConfig(config), rt); }
export { isTokenExpired as isWebexTokenExpired };