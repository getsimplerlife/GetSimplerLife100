import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

/**
 * Google Sheets OAuth 2.0 — Authorization Code flow (PKCE).
 *
 * Scopes:
 *   - https://www.googleapis.com/auth/spreadsheets  — create/read/write spreadsheet data
 *   - https://www.googleapis.com/auth/drive.file    — create the backing Drive file
 *   - https://www.googleapis.com/auth/drive.metadata.readonly — read file metadata
 *
 * Canonical hosts (never guessed):
 *   - authorize: https://accounts.google.com/o/oauth2/v2/auth
 *   - token:     https://oauth2.googleapis.com/token
 */
export function getGSheetsOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    flowType: "authorization_code",
  };
}

export async function buildSheetsAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getGSheetsOAuthConfig(config);
  const s = generateState();
  const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}

export async function handleSheetsCallback(config: any, code: string, verifier: string) {
  return exchangeCode(getGSheetsOAuthConfig(config), code, verifier);
}

export async function refreshSheetsToken(config: any, rt: string) {
  return refreshToken(getGSheetsOAuthConfig(config), rt);
}

export { isTokenExpired as isSheetsTokenExpired };
