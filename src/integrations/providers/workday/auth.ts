import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

export function getWorkdayOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string; tenant: string }): OAuthConfig {
  return { clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, scopes: ["cc_hcm", "api"], authorizeUrl: `https://${config.tenant}.myworkday.com/authorize`, tokenUrl: `https://${config.tenant}.myworkday.com/token`, flowType: "client_credentials" };
}
export async function handleWorkdayToken(config: any): Promise<any> {
  const r = await fetch(`https://${config.tenant}.myworkday.com/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret }) });
  return r.json();
}