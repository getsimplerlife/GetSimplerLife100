import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, isTokenExpired } from "../../framework/oauth";

export function getSugarOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; siteUrl: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["api"], authorizeUrl: `${config.siteUrl.replace(/\/+$/, "")}/oauth/authorize`, tokenUrl: `${config.siteUrl.replace(/\/+$/, "")}/oauth/token`, flowType: "authorization_code" };
}

export async function buildSugarAuthUrl(config: any): Promise<{ url: string; state: string }> {
  const oauthConfig = getSugarOAuthConfig(config); const state = generateState();
  return { url: buildAuthorizeUrl(oauthConfig, state), state };
}
export async function handleSugarCallback(config: any, code: string) { return exchangeCode(getSugarOAuthConfig(config), code); }
export async function refreshSugarToken(config: any, refreshTokenValue: string) { return refreshToken(getSugarOAuthConfig(config), refreshTokenValue); }
export { isTokenExpired as isSugarTokenExpired };