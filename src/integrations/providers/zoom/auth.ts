import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getZoomOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["meeting:write", "meeting:read", "user:read", "user:write", "recording:read", "chat_channel:read", "chat_channel:write", "chat_message:read", "chat_message:write", "phone:read", "phone:write"], authorizeUrl: "https://zoom.us/oauth/authorize", tokenUrl: "https://zoom.us/oauth/token", flowType: "authorization_code" };
}
export async function buildZoomAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getZoomOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleZoomCallback(config: any, code: string, verifier: string) { return exchangeCode(getZoomOAuthConfig(config), code, verifier); }
export async function refreshZoomToken(config: any, rt: string) { return refreshToken(getZoomOAuthConfig(config), rt); }
export { isTokenExpired as isZoomTokenExpired };