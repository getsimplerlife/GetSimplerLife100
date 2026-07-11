import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getBoxOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["manage_webhook", "manage_metadata", "root_readwrite", "manage_groups", "item_preview", "item_share", "item_upload", "item_download", "item_rename", "item_delete"], authorizeUrl: "https://account.box.com/api/oauth2/authorize", tokenUrl: "https://api.box.com/oauth2/token", flowType: "authorization_code" };
}
export async function buildBoxAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getBoxOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleBoxCallback(config: any, code: string, verifier: string) { return exchangeCode(getBoxOAuthConfig(config), code, verifier); }
export async function refreshBoxToken(config: any, rt: string) { return refreshToken(getBoxOAuthConfig(config), rt); }
export { isTokenExpired as isBoxTokenExpired };