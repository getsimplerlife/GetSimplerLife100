import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getTeamsOAuthConfig(config: { tenantId: string; clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["Channel.ReadBasic.All", "ChannelMessage.Read.All", "ChannelMessage.Send", "Chat.Read", "Chat.ReadWrite", "ChatMessage.Send", "Team.ReadBasic.All", "User.Read", "Presence.Read.All", "OnlineMeetings.ReadWrite.All", "offline_access"], authorizeUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`, tokenUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, flowType: "authorization_code" };
}
export async function buildTeamsAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getTeamsOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleTeamsCallback(config: any, code: string, verifier: string) { return exchangeCode(getTeamsOAuthConfig(config), code, verifier); }
export async function refreshTeamsToken(config: any, rt: string) { return refreshToken(getTeamsOAuthConfig(config), rt); }
export { isTokenExpired as isTeamsTokenExpired };