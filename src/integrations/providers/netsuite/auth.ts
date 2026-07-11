import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export interface NetSuiteAuthConfig { clientId: string; clientSecret: string; redirectUri: string; accountId: string; }

export function getNetSuiteOAuthConfig(config: NetSuiteAuthConfig): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["rest_webservices"], authorizeUrl: `https://${config.accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/authorize`, tokenUrl: `https://${config.accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`, flowType: "authorization_code" };
}

export async function buildNetSuiteAuthUrl(config: NetSuiteAuthConfig): Promise<{ url: string; state: string; verifier: string }> {
  const o = getNetSuiteOAuthConfig(config); const s = generateState(); const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}
export async function handleNetSuiteCallback(config: NetSuiteAuthConfig, code: string, verifier: string) { return exchangeCode(getNetSuiteOAuthConfig(config), code, verifier); }
export async function refreshNetSuiteToken(config: NetSuiteAuthConfig, rt: string) { return refreshToken(getNetSuiteOAuthConfig(config), rt); }
export { isTokenExpired as isNetSuiteTokenExpired };