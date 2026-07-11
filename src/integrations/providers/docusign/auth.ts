import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getDocuSignOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; accountId?: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["signature", "impersonation", "dtr.rooms.read", "dtr.rooms.write", "extended"], authorizeUrl: "https://account.docusign.com/oauth/auth", tokenUrl: "https://account.docusign.com/oauth/token", flowType: "authorization_code" };
}
export async function buildDocuSignAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getDocuSignOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleDocuSignCallback(config: any, code: string, verifier: string) { return exchangeCode(getDocuSignOAuthConfig(config), code, verifier); }
export async function refreshDocuSignToken(config: any, rt: string) { return refreshToken(getDocuSignOAuthConfig(config), rt); }
export { isTokenExpired as isDocuSignTokenExpired };