import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

/**
 * Google Slides OAuth 2.0 — Authorization Code flow (PKCE).
 *
 * Scopes:
 *   - https://www.googleapis.com/auth/presentations — create/read/edit presentations
 *   - https://www.googleapis.com/auth/drive.file     — create the backing Drive file
 *   - https://www.googleapis.com/auth/drive.metadata.readonly — read file metadata
 *
 * Canonical hosts (never guessed):
 *   - authorize: https://accounts.google.com/o/oauth2/v2/auth
 *   - token:     https://oauth2.googleapis.com/token
 */
export function getGSlidesOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: [
      "https://www.googleapis.com/auth/presentations",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    flowType: "authorization_code",
  };
}

export async function buildSlidesAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getGSlidesOAuthConfig(config);
  const s = generateState();
  const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}

export async function handleSlidesCallback(config: any, code: string, verifier: string) {
  return exchangeCode(getGSlidesOAuthConfig(config), code, verifier);
}

export async function refreshSlidesToken(config: any, rt: string) {
  return refreshToken(getGSlidesOAuthConfig(config), rt);
}

export { isTokenExpired as isSlidesTokenExpired };
