import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getBasecampOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["read", "write"], authorizeUrl: "https://launchpad.37signals.com/authorization/new", tokenUrl: "https://launchpad.37signals.com/authorization/token", flowType: "authorization_code" };
}
export { buildJiraAuthUrl as buildBasecampAuthUrl, handleJiraCallback as handleBasecampCallback, refreshJiraToken as refreshBasecampToken, isJiraTokenExpired as isBasecampTokenExpired } from "../jira/auth";