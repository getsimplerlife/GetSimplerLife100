import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getNotionOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: [], authorizeUrl: "https://api.notion.com/v1/oauth/authorize", tokenUrl: "https://api.notion.com/v1/oauth/token", flowType: "authorization_code" };
}
export { buildJiraAuthUrl as buildNotionAuthUrl, handleJiraCallback as handleNotionCallback, refreshJiraToken as refreshNotionToken, isJiraTokenExpired as isNotionTokenExpired } from "../jira/auth";