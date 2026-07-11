import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getOracleOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; baseUrl: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["https://api.oracle.com/auth/userinfo.read"], authorizeUrl: `${config.baseUrl.replace(/\/+$/, "")}/oauth/v2/authorize`, tokenUrl: `${config.baseUrl.replace(/\/+$/, "")}/oauth/v2/token`, flowType: "authorization_code" };
}
export async function buildOracleAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getOracleOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleOracleCallback(config: any, code: string, verifier: string) { return exchangeCode(getOracleOAuthConfig(config), code, verifier); }
export async function refreshOracleToken(config: any, rt: string) { return refreshToken(getOracleOAuthConfig(config), rt); }
export { isTokenExpired as isOracleTokenExpired };