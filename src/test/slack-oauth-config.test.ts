import { describe, it, expect } from "vitest";
import { getSlackOAuthConfig } from "../integrations/providers/slack/auth";

describe("Slack OAuth scopes", () => {
  const ALLOWED_SCOPES = [
    "channels:read",
    "channels:history",
    "channels:join",
    "chat:write",
    "chat:write.public",
    "users:read",
    "users:read.email",
    "reactions:write",
  ];

  const config = getSlackOAuthConfig({
    clientId: "test-id",
    clientSecret: "test-secret",
    redirectUri: "https://example.com/oauth/callback",
  });

  it("requests exactly 8 bot scopes — no more, no less", () => {
    expect(config.scopes).toHaveLength(ALLOWED_SCOPES.length);
  });

  for (const scope of ALLOWED_SCOPES) {
    it(`includes bot scope: ${scope}`, () => {
      expect(config.scopes).toContain(scope);
    });
  }

  it("does NOT include deprecated files:write scope (breaks new Slack app installs)", () => {
    expect(config.scopes).not.toContain("files:write");
  });

  it("does NOT include deprecated files:read scope", () => {
    expect(config.scopes).not.toContain("files:read");
  });

  it("does NOT include user-token search:read scope (cannot be in bot scope param)", () => {
    expect(config.scopes).not.toContain("search:read");
  });

  it("does NOT include unused channels:manage scope", () => {
    expect(config.scopes).not.toContain("channels:manage");
  });

  it("does NOT include unused reactions:read scope", () => {
    expect(config.scopes).not.toContain("reactions:read");
  });

  it("does NOT include unused team:read scope", () => {
    expect(config.scopes).not.toContain("team:read");
  });

  it("OAuth config uses authorization_code flow with Slack's v2 endpoints", () => {
    expect(config.flowType).toBe("authorization_code");
    expect(config.authorizeUrl).toBe("https://slack.com/oauth/v2/authorize");
    expect(config.tokenUrl).toBe("https://slack.com/api/oauth.v2.access");
  });
});
