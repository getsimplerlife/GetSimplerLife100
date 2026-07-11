import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getRCOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; serverUrl?: string }): OAuthConfig {
  const base = config.serverUrl || "https://platform.ringcentral.com";
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["CallLog", "CallLogRead", "ReadCallLog", "ReadMessages", "SMS", "Fax", "Webinar", "Meetings", "ExtensionInfo", "ReadAccounts", "ReadContacts"], authorizeUrl: `${base}/restapi/oauth/authorize`, tokenUrl: `${base}/restapi/oauth/token`, flowType: "authorization_code" };
}
export async function buildRCAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getRCOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleRCCallback(config: any, code: string, verifier: string) { return exchangeCode(getRCOAuthConfig(config), code, verifier); }
export async function refreshRCToken(config: any, rt: string) { return refreshToken(getRCOAuthConfig(config), rt); }
export { isTokenExpired as isRCTokenExpired };