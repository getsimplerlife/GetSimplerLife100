import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, isTokenExpired } from "../../framework/oauth";

export function getCreatioOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; siteUrl: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["General.Read", "General.Write"], authorizeUrl: `${config.siteUrl.replace(/\/+$/, "")}/ServiceModel/AuthService.svc/Login`, tokenUrl: `${config.siteUrl.replace(/\/+$/, "")}/rest/api/oauth/token`, flowType: "authorization_code" };
}

export async function buildCreatioAuthUrl(config: any): Promise<{ url: string; state: string }> {
  const oauthConfig = getCreatioOAuthConfig(config); const state = generateState();
  return { url: buildAuthorizeUrl(oauthConfig, state), state };
}
export async function handleCreatioCallback(config: any, code: string) { return exchangeCode(getCreatioOAuthConfig(config), code); }
export async function refreshCreatioToken(config: any, refreshTokenValue: string) { return refreshToken(getCreatioOAuthConfig(config), refreshTokenValue); }
export { isTokenExpired as isCreatioTokenExpired };