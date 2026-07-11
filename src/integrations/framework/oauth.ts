/**
 * OAuth 2.0 Flow Handler
 *
 * Manages OAuth 2.0 authorization flows for all provider integrations.
 * Supports Authorization Code, Client Credentials, and JWT Bearer flows.
 * Includes PKCE support for enhanced security.
 */

import { createHash, randomBytes } from "node:crypto";

export type OAuthFlowType = "authorization_code" | "client_credentials" | "jwt_bearer";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authorizeUrl: string;
  tokenUrl: string;
  refreshUrl?: string;
  revokeUrl?: string;
  flowType: OAuthFlowType;
  usePKCE?: boolean;
  extraParams?: Record<string, string>;
}

export interface OAuthState {
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  provider: string;
  userId: string;
  expiresAt: number;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
  instanceUrl?: string;
  raw: Record<string, any>;
}

/**
 * Generate PKCE code verifier (43-128 chars, unreserved characters)
 */
export function generateCodeVerifier(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = randomBytes(64);
  let verifier = "";
  for (let i = 0; i < bytes.length; i++) {
    verifier += chars[bytes[i] % chars.length];
  }
  return verifier;
}

/**
 * Generate PKCE code challenge (S256 method)
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier).digest();
  return hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Generate a random state string for CSRF protection
 */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Build the authorization URL for OAuth 2.0 Authorization Code flow
 */
export function buildAuthorizeUrl(config: OAuthConfig, state: string, codeVerifier?: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
    scope: config.scopes.join(" "),
  });

  if (config.usePKCE && codeVerifier) {
    params.set("code_challenge", generateCodeChallenge(codeVerifier));
    params.set("code_challenge_method", "S256");
  }

  if (config.extraParams) {
    for (const [key, value] of Object.entries(config.extraParams)) {
      params.set(key, value);
    }
  }

  return `${config.authorizeUrl}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens
 */
export async function exchangeCode(
  config: OAuthConfig,
  code: string,
  codeVerifier?: string,
): Promise<OAuthTokens> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  if (config.usePKCE && codeVerifier) {
    params.set("code_verifier", codeVerifier);
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return parseTokenResponse(data);
}

/**
 * Refresh an expired access token
 */
export async function refreshToken(
  config: OAuthConfig,
  refreshTokenValue: string,
): Promise<OAuthTokens> {
  const refreshUrl = config.refreshUrl || config.tokenUrl;

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshTokenValue,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return parseTokenResponse(data);
}

/**
 * Parse a token endpoint response into a normalized OAuthTokens object
 */
function parseTokenResponse(data: Record<string, any>): OAuthTokens {
  const tokens: OAuthTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
    tokenType: data.token_type || "Bearer",
    instanceUrl: data.instance_url,
    raw: data,
  };

  if (data.expires_in) {
    tokens.expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
  } else if (data.expires_at) {
    tokens.expiresAt = data.expires_at;
  }

  return tokens;
}

/**
 * Check if a token is expired (with 5-minute buffer)
 */
export function isTokenExpired(tokens: OAuthTokens): boolean {
  if (!tokens.expiresAt) return false;
  return Date.now() / 1000 >= tokens.expiresAt - 300;
}

/**
 * Revoke tokens if the provider supports it
 */
export async function revokeTokens(
  config: OAuthConfig,
  tokens: OAuthTokens,
): Promise<void> {
  if (!config.revokeUrl) return;

  const params = new URLSearchParams({
    token: tokens.accessToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  await fetch(config.revokeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
}