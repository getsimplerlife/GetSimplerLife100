import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getSsheetOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["ADMIN_USERS", "ADMIN_SHEETS", "ADMIN_WEBHOOKS", "DELETE_SHEETS", "READ_SHEETS", "WRITE_SHEETS", "SHARE_SHEETS"], authorizeUrl: "https://app.smartsheet.com/b/authorize", tokenUrl: "https://api.smartsheet.com/2.0/token", flowType: "authorization_code" };
}
export { buildJiraAuthUrl as buildSsheetAuthUrl, handleJiraCallback as handleSsheetCallback, refreshJiraToken as refreshSsheetToken, isJiraTokenExpired as isSsheetTokenExpired } from "../jira/auth";