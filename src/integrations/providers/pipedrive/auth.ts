import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, isTokenExpired } from "../../framework/oauth";

export function getPipedriveOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["deals:read", "deals:write", "contacts:read", "contacts:write", "users:read", "leads:read", "leads:write", "products:read", "products:write"], authorizeUrl: "https://oauth.pipedrive.com/oauth/authorize", tokenUrl: "https://oauth.pipedrive.com/oauth/token", flowType: "authorization_code" };
}

export async function buildPipedriveAuthUrl(config: any): Promise<{ url: string; state: string }> {
  const oauthConfig = getPipedriveOAuthConfig(config); const state = generateState();
  return { url: buildAuthorizeUrl(oauthConfig, state), state };
}
export async function handlePipedriveCallback(config: any, code: string) { return exchangeCode(getPipedriveOAuthConfig(config), code); }
export async function refreshPipedriveToken(config: any, refreshTokenValue: string) { return refreshToken(getPipedriveOAuthConfig(config), refreshTokenValue); }
export { isTokenExpired as isPipedriveTokenExpired };