import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

/**
 * Microsoft Graph OAuth 2.0 — shared Authorization Code flow (PKCE) for the
 * Microsoft Office providers (Word / Excel / PowerPoint / OneDrive).
 *
 * Canonical hosts (never guessed):
 *   - authorize: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize
 *   - token:     https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
 *
 * tenantId defaults to "common" (multi-tenant); a tenant-specific tenantId can
 * be supplied when the app registration is single-tenant.
 */
export const GRAPH_DEFAULT_TENANT = "common";
export const GRAPH_AUTHORITY_BASE = "https://login.microsoftonline.com";

export interface GraphOAuthInput {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tenantId?: string;
  scopes: string[];
}

export function graphOAuthConfig(config: GraphOAuthInput): OAuthConfig {
  const tenant = config.tenantId?.trim() || GRAPH_DEFAULT_TENANT;
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
    authorizeUrl: `${GRAPH_AUTHORITY_BASE}/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `${GRAPH_AUTHORITY_BASE}/${tenant}/oauth2/v2.0/token`,
    flowType: "authorization_code",
  };
}

export async function buildGraphAuthUrl(config: GraphOAuthInput): Promise<{ url: string; state: string; verifier: string }> {
  const o = graphOAuthConfig(config);
  const s = generateState();
  const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}

export async function handleGraphCallback(config: GraphOAuthInput, code: string, verifier: string) {
  return exchangeCode(graphOAuthConfig(config), code, verifier);
}

export async function refreshGraphToken(config: GraphOAuthInput, rt: string) {
  return refreshToken(graphOAuthConfig(config), rt);
}

export { isTokenExpired as isGraphTokenExpired };
