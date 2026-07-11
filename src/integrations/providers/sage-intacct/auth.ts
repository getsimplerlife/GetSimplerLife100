import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getIntacctOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["openid", "profile", "email", "IntacctEntity"], authorizeUrl: "https://www.intacct.com/ia/oauth2/auth", tokenUrl: "https://www.intacct.com/ia/oauth2/token", flowType: "authorization_code" };
}
export async function buildIntacctAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getIntacctOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleIntacctCallback(config: any, code: string, verifier: string) { return exchangeCode(getIntacctOAuthConfig(config), code, verifier); }
export async function refreshIntacctToken(config: any, rt: string) { return refreshToken(getIntacctOAuthConfig(config), rt); }
export { isTokenExpired as isIntacctTokenExpired };