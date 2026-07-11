/**
 * Salesforce Integration — Auth
 *
 * OAuth 2.0 JWT Bearer flow for Salesforce REST API.
 * Supports both production and sandbox environments.
 */

import {
  OAuthConfig,
  OAuthTokens,
  buildAuthorizeUrl,
  exchangeCode,
  refreshToken,
  generateState,
  generateCodeVerifier,
  isTokenExpired,
} from "../../framework/oauth";

export interface SalesforceAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  isSandbox?: boolean;
}

const PROD_AUTH_URL = "https://login.salesforce.com/services/oauth2/authorize";
const PROD_TOKEN_URL = "https://login.salesforce.com/services/oauth2/token";
const SANDBOX_AUTH_URL = "https://test.salesforce.com/services/oauth2/authorize";
const SANDBOX_TOKEN_URL = "https://test.salesforce.com/services/oauth2/token";

export function getSalesforceOAuthConfig(config: SalesforceAuthConfig): OAuthConfig {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: ["api", "refresh_token", "offline_access"],
    authorizeUrl: config.isSandbox ? SANDBOX_AUTH_URL : PROD_AUTH_URL,
    tokenUrl: config.isSandbox ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL,
    flowType: "authorization_code",
  };
}

export async function buildSalesforceAuthUrl(
  config: SalesforceAuthConfig,
): Promise<{ url: string; state: string; verifier: string }> {
  const oauthConfig = getSalesforceOAuthConfig(config);
  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = buildAuthorizeUrl(oauthConfig, state, verifier);
  return { url, state, verifier };
}

export async function handleSalesforceCallback(
  config: SalesforceAuthConfig,
  code: string,
  verifier: string,
): Promise<OAuthTokens> {
  const oauthConfig = getSalesforceOAuthConfig(config);
  return exchangeCode(oauthConfig, code, verifier);
}

export async function refreshSalesforceToken(
  config: SalesforceAuthConfig,
  refreshTokenValue: string,
): Promise<OAuthTokens> {
  const oauthConfig = getSalesforceOAuthConfig(config);
  return refreshToken(oauthConfig, refreshTokenValue);
}

export { isTokenExpired as isSalesforceTokenExpired };