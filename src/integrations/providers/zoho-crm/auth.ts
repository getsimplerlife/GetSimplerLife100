import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getZohoOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; accountsDomain?: string }): OAuthConfig {
  const domain = config.accountsDomain || "https://accounts.zoho.com";
  return {
    clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri,
    scopes: ["ZohoCRM.modules.ALL", "ZohoCRM.settings.ALL", "ZohoCRM.users.ALL", "Aaaserver.profile.READ"],
    authorizeUrl: `${domain}/oauth/v2/auth`, tokenUrl: `${domain}/oauth/v2/token`,
    flowType: "authorization_code",
  };
}

export async function buildZohoAuthUrl(config: { clientId: string; clientSecret: string; redirectUri: string; accountsDomain?: string }): Promise<{ url: string; state: string; verifier: string }> {
  const oauthConfig = getZohoOAuthConfig(config);
  const state = generateState(); const verifier = generateCodeVerifier();
  return { url: buildAuthorizeUrl(oauthConfig, state, verifier), state, verifier };
}

export async function handleZohoCallback(config: any, code: string, verifier: string) { return exchangeCode(getZohoOAuthConfig(config), code, verifier); }
export async function refreshZohoToken(config: any, refreshTokenValue: string) { return refreshToken(getZohoOAuthConfig(config), refreshTokenValue); }
export { isTokenExpired as isZohoTokenExpired };