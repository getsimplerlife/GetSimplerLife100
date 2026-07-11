import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getDropboxOAuthConfig(config: { appKey: string; appSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.appKey, clientSecret: config.appSecret, redirectUri: config.redirectUri, scopes: ["files.metadata.read", "files.metadata.write", "files.content.read", "files.content.write", "sharing.read", "sharing.write", "file_requests.read", "file_requests.write", "account_info.read"], authorizeUrl: "https://www.dropbox.com/oauth2/authorize", tokenUrl: "https://api.dropboxapi.com/oauth2/token", flowType: "authorization_code" };
}
export async function buildDropboxAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getDropboxOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleDropboxCallback(config: any, code: string, verifier: string) { return exchangeCode(getDropboxOAuthConfig(config), code, verifier); }
export async function refreshDropboxToken(config: any, rt: string) { return refreshToken(getDropboxOAuthConfig(config), rt); }
export { isTokenExpired as isDropboxTokenExpired };