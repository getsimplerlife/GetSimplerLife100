import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getGustoOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["employee:read", "employee:write", "company:read", "payroll:read", "payroll:write", "time_off:read", "time_off:write", "benefits:read", "contractor:read", "contractor:write"], authorizeUrl: "https://api.gusto.com/v1/oauth/authorize", tokenUrl: "https://api.gusto.com/v1/oauth/token", flowType: "authorization_code" };
}
export { buildJiraAuthUrl as buildGustoAuthUrl, handleJiraCallback as handleGustoCallback, refreshJiraToken as refreshGustoToken, isJiraTokenExpired as isGustoTokenExpired } from "../jira/auth";