import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getClickUpOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["task:read", "task:write", "space:read", "space:write", "folder:read", "folder:write", "list:read", "list:write", "doc:read", "doc:write", "goal:read", "goal:write", "user:read"], authorizeUrl: "https://app.clickup.com/api", tokenUrl: "https://api.clickup.com/api/v2/oauth/token", flowType: "authorization_code" };
}
export { buildAsanaAuthUrl as buildClickUpAuthUrl, handleAsanaCallback as handleClickUpCallback, refreshAsanaToken as refreshClickUpToken, isAsanaTokenExpired as isClickUpTokenExpired } from "../asana/auth";