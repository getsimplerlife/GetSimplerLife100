import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getBillOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["openid", "profile", "email"], authorizeUrl: "https://api.bill.com/oauth/v2/auth", tokenUrl: "https://api.bill.com/oauth/v2/token", flowType: "authorization_code" };
}
export async function buildBillAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getBillOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleBillCallback(config: any, code: string, verifier: string) { return exchangeCode(getBillOAuthConfig(config), code, verifier); }
export async function refreshBillToken(config: any, rt: string) { return refreshToken(getBillOAuthConfig(config), rt); }
export { isTokenExpired as isBillTokenExpired };