import { OAuthConfig, buildAuthorizeUrl, exchangeCode, refreshToken, generateState, generateCodeVerifier, isTokenExpired } from "../../framework/oauth";

/**
 * Google Calendar OAuth 2.0 — Authorization Code flow (PKCE).
 *
 * Scopes (minimal safe set):
 *   - https://www.googleapis.com/auth/calendar.events              — create/manage events
 *   - https://www.googleapis.com/auth/calendar.readonly            — read events (read slice)
 *   - https://www.googleapis.com/auth/calendar.calendarlist.readonly — list the user's calendars
 *
 * Canonical hosts (never guessed):
 *   - authorize: https://accounts.google.com/o/oauth2/v2/auth
 *   - token:     https://oauth2.googleapis.com/token
 *
 * Refresh-token guarantee: extraParams MUST carry access_type=offline AND
 * prompt=consent or Google issues NO refresh token and the tenant connection
 * dies ~1h after connecting (guarded by permanent tests in
 * src/test/google-oauth-flow.test.ts).
 */
export function getGCalendarOAuthConfig(config: { clientId: string; clientSecret: string; redirectUri: string }): OAuthConfig {
  return {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    scopes: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    ],
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    flowType: "authorization_code",
    extraParams: { access_type: "offline", prompt: "consent" },
  };
}

export async function buildCalendarAuthUrl(config: any): Promise<{ url: string; state: string; verifier: string }> {
  const o = getGCalendarOAuthConfig(config);
  const s = generateState();
  const v = generateCodeVerifier();
  return { url: buildAuthorizeUrl(o, s, v), state: s, verifier: v };
}

export async function handleCalendarCallback(config: any, code: string, verifier: string) {
  return exchangeCode(getGCalendarOAuthConfig(config), code, verifier);
}

export async function refreshCalendarToken(config: any, rt: string) {
  return refreshToken(getGCalendarOAuthConfig(config), rt);
}

export { isTokenExpired as isCalendarTokenExpired };
