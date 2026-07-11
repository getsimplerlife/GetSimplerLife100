import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getWaveOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["business"], authorizeUrl: "https://api.waveapps.com/oauth2/authorize", tokenUrl: "https://api.waveapps.com/oauth2/token", flowType: "authorization_code" };
}
export async function buildWaveAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getWaveOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleWaveCallback(config: any, code: string, verifier: string) { return exchangeCode(getWaveOAuthConfig(config), code, verifier); }
export async function refreshWaveToken(config: any, rt: string) { return refreshToken(getWaveOAuthConfig(config), rt); }
export { isTokenExpired as isWaveTokenExpired };