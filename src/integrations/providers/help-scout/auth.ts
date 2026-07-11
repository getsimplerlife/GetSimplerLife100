import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getHSAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["mailbox:read", "mailbox:write", "customer:read", "customer:write", "report:read"], authorizeUrl: "https://secure.helpscout.net/authentication/authorize", tokenUrl: "https://api.helpscout.net/v2/oauth2/token", flowType: "authorization_code" };
}
export { buildJiraAuthUrl as buildHelpScoutAuthUrl, handleJiraCallback as handleHelpScoutCallback, refreshJiraToken as refreshHelpScoutToken, isJiraTokenExpired as isHelpScoutTokenExpired } from "../jira/auth";