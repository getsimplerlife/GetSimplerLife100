import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getExpensifyOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["openid", "expensify.create", "expensify.read", "expensify.write"], authorizeUrl: "https://identity.expensify.com/oauth2/authorize", tokenUrl: "https://identity.expensify.com/oauth2/token", flowType: "authorization_code" };
}
export async function buildExpensifyAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getExpensifyOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleExpensifyCallback(config: any, code: string, verifier: string) { return exchangeCode(getExpensifyOAuthConfig(config), code, verifier); }
export async function refreshExpensifyToken(config: any, rt: string) { return refreshToken(getExpensifyOAuthConfig(config), rt); }
export { isTokenExpired as isExpensifyTokenExpired };