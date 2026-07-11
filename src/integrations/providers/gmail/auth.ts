import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getGmailOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.labels", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.metadata"], authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", flowType: "authorization_code" };
}
export async function buildGmailAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getGmailOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleGmailCallback(config: any, code: string, verifier: string) { return exchangeCode(getGmailOAuthConfig(config), code, verifier); }
export async function refreshGmailToken(config: any, rt: string) { return refreshToken(getGmailOAuthConfig(config), rt); }
export { isTokenExpired as isGmailTokenExpired };