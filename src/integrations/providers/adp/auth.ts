import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getADPOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["api", "openid", "profile"], authorizeUrl: "https://accounts.adp.com/auth/oauth/v2/authorize", tokenUrl: "https://accounts.adp.com/auth/oauth/v2/token", flowType: "authorization_code" };
}
export { buildJiraAuthUrl as buildADPAuthUrl, handleJiraCallback as handleADPCallback, refreshJiraToken as refreshADPToken, isJiraTokenExpired as isADPTokenExpired } from "../jira/auth";