import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getJiraOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["read:jira-work", "write:jira-work", "read:jira-user", "manage:jira-project", "manage:jira-configuration", "offline_access"], authorizeUrl: "https://auth.atlassian.com/authorize", tokenUrl: "https://auth.atlassian.com/oauth/token", flowType: "authorization_code" };
}
export async function buildJiraAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getJiraOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleJiraCallback(config: any, code: string, verifier: string) { return exchangeCode(getJiraOAuthConfig(config), code, verifier); }
export async function refreshJiraToken(config: any, rt: string) { return refreshToken(getJiraOAuthConfig(config), rt); }
export { isTokenExpired as isJiraTokenExpired };