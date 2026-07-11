import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getPaychexOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["worker:read", "worker:write", "payroll:read", "company:read"], authorizeUrl: "https://api.paychex.com/auth/oauth/v2/authorize", tokenUrl: "https://api.paychex.com/auth/oauth/v2/token", flowType: "authorization_code" };
}
export { buildJiraAuthUrl as buildPaychexAuthUrl, handleJiraCallback as handlePaychexCallback, refreshJiraToken as refreshPaychexToken, isJiraTokenExpired as isPaychexTokenExpired } from "../jira/auth";