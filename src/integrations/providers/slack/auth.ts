import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getSlackOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["channels:read", "channels:history", "channels:join", "channels:manage", "chat:write", "chat:write.public", "users:read", "users:read.email", "reactions:read", "reactions:write", "files:read", "files:write", "team:read", "search:read"], authorizeUrl: "https://slack.com/oauth/v2/authorize", tokenUrl: "https://slack.com/api/oauth.v2.access", flowType: "authorization_code" };
}
export async function buildSlackAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getSlackOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleSlackCallback(config: any, code: string, verifier: string) { return exchangeCode(getSlackOAuthConfig(config), code, verifier); }
export async function refreshSlackToken(config: any, rt: string) { return refreshToken(getSlackOAuthConfig(config), rt); }
export { isTokenExpired as isSlackTokenExpired };