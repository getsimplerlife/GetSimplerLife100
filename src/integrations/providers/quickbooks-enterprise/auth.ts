import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getQBOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["com.intuit.quickbooks.accounting", "openid", "profile", "email", "phone", "address"], authorizeUrl: "https://appcenter.intuit.com/connect/oauth2", tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", flowType: "authorization_code" };
}
export async function buildQBAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getQBOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleQBCallback(config: any, code: string, verifier: string) { return exchangeCode(getQBOAuthConfig(config), code, verifier); }
export async function refreshQBToken(config: any, rt: string) { return refreshToken(getQBOAuthConfig(config), rt); }
export { isTokenExpired as isQBTokenExpired };