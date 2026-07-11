import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getDocAIConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["https://www.googleapis.com/auth/cloud-platform"], authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", flowType: "authorization_code" };
}
export { buildGmailAuthUrl as buildDocAIAuthUrl, handleGmailCallback as handleDocAICallback, refreshGmailToken as refreshDocAIToken, isGmailTokenExpired as isDocAITokenExpired } from "../gmail/auth";