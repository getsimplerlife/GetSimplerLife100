import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getDynamicsOAuthConfig(config: { tenantId: string; clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: [`https://${config.tenantId}.crm.dynamics.com/.default`, "offline_access"],
    authorizeUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    flowType: "authorization_code",
  };
}

export async function buildDynamicsAuthUrl(config: { tenantId: string; clientId: string; clientSecret: string; redirectUri: string }): Promise<{ url: string; state: string; verifier: string }> {
  const oauthConfig = getDynamicsOAuthConfig(config);
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = buildAuthorizeUrl(oauthConfig, state, verifier);
  return { url, state, verifier };
}

export async function handleDynamicsCallback(config: { tenantId: string; clientId: string; clientSecret: string; redirectUri: string }, code: string, verifier: string) {
  return exchangeCode(getDynamicsOAuthConfig(config), code, verifier);
}

export async function refreshDynamicsToken(config: { tenantId: string; clientId: string; clientSecret: string; redirectUri: string }, refreshTokenValue: string) {
  return refreshToken(getDynamicsOAuthConfig(config), refreshTokenValue);
}

export { isTokenExpired as isDynamicsTokenExpired };