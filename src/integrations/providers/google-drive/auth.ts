import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getGDriveOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive.metadata.readonly"], authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", flowType: "authorization_code" };
}
export async function buildGDriveAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getGDriveOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleGDriveCallback(config: any, code: string, verifier: string) { return exchangeCode(getGDriveOAuthConfig(config), code, verifier); }
export async function refreshGDriveToken(config: any, rt: string) { return refreshToken(getGDriveOAuthConfig(config), rt); }
export { isTokenExpired as isGDriveTokenExpired };