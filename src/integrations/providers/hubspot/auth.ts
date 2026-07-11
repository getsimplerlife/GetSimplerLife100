/**
 * HubSpot Integration — Auth
 */
import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getHubSpotOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.companies.read", "crm.objects.companies.write", "crm.objects.deals.read", "crm.objects.deals.write", "crm.objects.owners.read", "tickets.read", "oauth"],
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    flowType: "authorization_code",
  };
}

export async function buildHubSpotAuthUrl(config: { clientId: string; clientSecret: string; redirectUri: string }): Promise<{ url: string; state: string; verifier: string }> {
  const oauthConfig = getHubSpotOAuthConfig(config);
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = buildAuthorizeUrl(oauthConfig, state, verifier);
  return { url, state, verifier };
}

export async function handleHubSpotCallback(config: { clientId: string; clientSecret: string; redirectUri: string }, code: string, verifier: string) {
  return exchangeCode(getHubSpotOAuthConfig(config), code, verifier);
}

export async function refreshHubSpotToken(config: { clientId: string; clientSecret: string; redirectUri: string }, refreshTokenValue: string) {
  return refreshToken(getHubSpotOAuthConfig(config), refreshTokenValue);
}

export { isTokenExpired as isHubSpotTokenExpired };