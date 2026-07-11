import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getAdobeSignOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["agreement_read", "agreement_write", "agreement_send", "library_read", "library_write", "user_read", "user_write", "webhook_read", "webhook_write", "offline_access"], authorizeUrl: "https://secure.na1.echosign.com/public/oauth/v2", tokenUrl: "https://api.na1.echosign.com/oauth/v2/token", flowType: "authorization_code" };
}
export async function buildAdobeSignAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getAdobeSignOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleAdobeSignCallback(config: any, code: string, verifier: string) { return exchangeCode(getAdobeSignOAuthConfig(config), code, verifier); }
export async function refreshAdobeSignToken(config: any, rt: string) { return refreshToken(getAdobeSignOAuthConfig(config), rt); }
export { isTokenExpired as isAdobeSignTokenExpired };