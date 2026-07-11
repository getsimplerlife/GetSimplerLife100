import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getDialpadOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["openid", "profile", "email", "calls", "sms", "contacts", "users"], authorizeUrl: "https://login.dialpad.com/oauth2/authorize", tokenUrl: "https://login.dialpad.com/oauth2/token", flowType: "authorization_code" };
}
export async function buildDialpadAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getDialpadOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleDialpadCallback(config: any, code: string, verifier: string) { return exchangeCode(getDialpadOAuthConfig(config), code, verifier); }
export async function refreshDialpadToken(config: any, rt: string) { return refreshToken(getDialpadOAuthConfig(config), rt); }
export { isTokenExpired as isDialpadTokenExpired };