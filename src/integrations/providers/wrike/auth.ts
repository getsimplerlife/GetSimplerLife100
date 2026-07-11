import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getWrikeOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["wsReadWrite", "amReadWriteGroup"], authorizeUrl: "https://login.wrike.com/oauth/authorize/v4", tokenUrl: "https://login.wrike.com/oauth/token", flowType: "authorization_code" };
}
export { buildJiraAuthUrl as buildWrikeAuthUrl, handleJiraCallback as handleWrikeCallback, refreshJiraToken as refreshWrikeToken, isJiraTokenExpired as isWrikeTokenExpired } from "../jira/auth";