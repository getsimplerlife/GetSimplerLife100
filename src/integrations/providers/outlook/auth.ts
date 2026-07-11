import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getOutlookOAuthConfig(config: { tenantId: string; clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["Mail.Read", "Mail.ReadWrite", "Mail.Send", "MailboxSettings.Read", "Calendars.Read", "Calendars.ReadWrite", "Contacts.Read", "Contacts.ReadWrite", "User.Read", "offline_access"], authorizeUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`, tokenUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`, flowType: "authorization_code" };
}
export async function buildOutlookAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getOutlookOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleOutlookCallback(config: any, code: string, verifier: string) { return exchangeCode(getOutlookOAuthConfig(config), code, verifier); }
export async function refreshOutlookToken(config: any, rt: string) { return refreshToken(getOutlookOAuthConfig(config), rt); }
export { isTokenExpired as isOutlookTokenExpired };