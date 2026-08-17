import { describe, it, expect } from "vitest";
import { getHubSpotOAuthConfig, buildHubSpotAuthUrl } from "../integrations/providers/hubspot/auth";

describe("HubSpot OAuth scopes", () => {
  const ALLOWED_SCOPES = [
    "crm.objects.contacts.read",
    "crm.objects.contacts.write",
    "crm.objects.companies.read",
    "crm.objects.companies.write",
    "crm.objects.deals.read",
    "crm.objects.deals.write",
    "crm.objects.owners.read",
    // Pipeline reads + deal-stage updates require this scope; missing it → 403
    // on read-pipeline-stages / update-deal-stage (provider-verification ROUND 9).
    "crm.schemas.pipelines.read",
    "tickets.read",
    "oauth",
  ];

  const config = getHubSpotOAuthConfig({
    clientId: "test-id",
    clientSecret: "test-secret",
    redirectUri: "https://example.com/oauth/callback",
  });

  it("requests exactly 10 scopes — no more, no less", () => {
    expect(config.scopes).toHaveLength(ALLOWED_SCOPES.length);
  });

  for (const scope of ALLOWED_SCOPES) {
    it(`includes scope: ${scope}`, () => {
      expect(config.scopes).toContain(scope);
    });
  }

  it("includes crm.schemas.pipelines.read (needed for read-pipeline-stages + update-deal-stage)", () => {
    expect(config.scopes).toContain("crm.schemas.pipelines.read");
  });

  it("keeps crm.objects.owners.read (read-owners; token predates it, re-consent grants it)", () => {
    expect(config.scopes).toContain("crm.objects.owners.read");
  });

  it("does NOT include write scopes we never use (fail-closed least-privilege)", () => {
    expect(config.scopes).not.toContain("crm.schemas.pipelines.write");
    expect(config.scopes).not.toContain("crm.objects.owners.write");
  });

  it("OAuth config uses authorization_code flow with HubSpot's endpoints", () => {
    expect(config.flowType).toBe("authorization_code");
    expect(config.authorizeUrl).toBe("https://app.hubspot.com/oauth/authorize");
    expect(config.tokenUrl).toBe("https://api.hubapi.com/oauth/v1/token");
  });

  it("the authorize URL carries the full scope list incl. pipelines.read (forces re-consent for new scopes)", async () => {
    const { url } = await buildHubSpotAuthUrl({
      clientId: "test-id",
      clientSecret: "test-secret",
      redirectUri: "https://example.com/oauth/callback",
    });
    const parsed = new URL(url);
    const scopeParam = parsed.searchParams.get("scope");
    expect(scopeParam).toBe(ALLOWED_SCOPES.join(" "));
    expect(scopeParam).toContain("crm.schemas.pipelines.read");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
