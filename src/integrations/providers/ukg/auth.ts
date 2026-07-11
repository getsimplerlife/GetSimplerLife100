import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getUKGOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["profile", "employee", "time", "payroll"], authorizeUrl: "https://login.ukg.com/oauth/authorize", tokenUrl: "https://login.ukg.com/oauth/token", flowType: "authorization_code" };
}
export { buildJiraAuthUrl as buildUKGAuthUrl, handleJiraCallback as handleUKGCallback, refreshJiraToken as refreshUKGToken, isJiraTokenExpired as isUKGTokenExpired } from "../jira/auth";