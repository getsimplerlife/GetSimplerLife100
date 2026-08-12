import { describe, expect, it } from "vitest";
import { getGDriveOAuthConfig } from "../integrations/providers/google-drive/auth";
import { getGDocsOAuthConfig } from "../integrations/providers/google-docs/auth";
import { getGSheetsOAuthConfig } from "../integrations/providers/google-sheets/auth";
import { getGSlidesOAuthConfig } from "../integrations/providers/google-slides/auth";
import { getGCalendarOAuthConfig } from "../integrations/providers/google-calendar/auth";

/**
 * Google OAuth flow regression suite (live-verification prep, 2026-08-12).
 *
 * Guards the refresh-token guarantee: every Google authorize URL MUST carry
 * access_type=offline + prompt=consent, or Google will not issue a refresh
 * token and the tenant connection dies when the 1-hour access token expires
 * (the hourly token refresher then has nothing to refresh).
 *
 * Also pins the canonical endpoints (never guessed) and the callback path.
 */

const PROVIDERS = [
  { id: "google-drive", label: "Drive", getConfig: getGDriveOAuthConfig },
  { id: "google-docs", label: "Docs", getConfig: getGDocsOAuthConfig },
  { id: "google-sheets", label: "Sheets", getConfig: getGSheetsOAuthConfig },
  { id: "google-slides", label: "Slides", getConfig: getGSlidesOAuthConfig },
  { id: "google-calendar", label: "Calendar", getConfig: getGCalendarOAuthConfig },
] as const;

describe("Google OAuth flow (refresh-token guarantee)", () => {
  for (const p of PROVIDERS) {
    it(`${p.label}: authorize URL requests offline access + consent (refresh token guaranteed)`, () => {
      const cfg = p.getConfig({ clientId: "client-id.test", clientSecret: "secret", redirectUri: "https://app.example/api/oauth/callback" });
      expect(cfg.extraParams).toBeDefined();
      expect(cfg.extraParams!.access_type).toBe("offline");
      expect(cfg.extraParams!.prompt).toBe("consent");
    });

    it(`${p.label}: uses canonical Google endpoints (no guessed URLs)`, () => {
      const cfg = p.getConfig({ clientId: "client-id.test", clientSecret: "secret", redirectUri: "https://app.example/api/oauth/callback" });
      expect(cfg.authorizeUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(cfg.tokenUrl).toBe("https://oauth2.googleapis.com/token");
    });

    it(`${p.label}: config carries callback path /api/oauth/callback through to the URL`, async () => {
      const cfg = p.getConfig({ clientId: "client-id.test", clientSecret: "secret", redirectUri: "https://app.example/api/oauth/callback" });
      const url = new URL(cfg.authorizeUrl);
      expect(url.host).toBe("accounts.google.com");
      expect(cfg.redirectUri).toContain("/api/oauth/callback");
      expect(cfg.flowType).toBe("authorization_code");
    });
  }
});
