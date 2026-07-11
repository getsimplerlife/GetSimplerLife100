import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getEgnyteOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; domain: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["egnyte.filesystem.read", "egnyte.filesystem.write", "egnyte.links.read", "egnyte.links.write"], authorizeUrl: `https://${config.domain}.egnyte.com/puboauth/v2/token`, tokenUrl: `https://${config.domain}.egnyte.com/puboauth/v2/token`, flowType: "authorization_code" };
}
export async function buildEgnyteAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getEgnyteOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleEgnyteCallback(config: any, code: string, verifier: string) { return exchangeCode(getEgnyteOAuthConfig(config), code, verifier); }
export async function refreshEgnyteToken(config: any, rt: string) { return refreshToken(getEgnyteOAuthConfig(config), rt); }
export { isTokenExpired as isEgnyteTokenExpired };