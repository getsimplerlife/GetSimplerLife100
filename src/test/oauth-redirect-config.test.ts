import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const providersDir = join(process.cwd(), "src/integrations/providers");
const oauthFiles = readdirSync(providersDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(providersDir, entry.name, "auth.ts"))
  .filter((file) => readFileSync(file, "utf8").match(/OAuthConfig|flowType/));

const QUERY_STRING_REDIRECT = /oauth\/callback\?provider=/;

describe("OAuth redirect URI safety", () => {
  it("has no localhost redirect destinations", () => {
    for (const file of oauthFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i);
    }
  });

  it("accepts redirectUri through every OAuth auth module or explicit alias", () => {
    for (const file of oauthFiles) {
      const source = readFileSync(file, "utf8");
      const acceptsRedirect = /redirectUri/.test(source) || /export\s*\{[^}]+\}\s*from\s*["'][^"']+\/auth["']/.test(source);
      expect(acceptsRedirect, file).toBe(true);
    }
  });

  it("constructs the canonical PATH-STYLE redirect URI for every provider (no ?provider= query strings)", () => {
    // Regression guard: provider consoles register exact-match redirect URIs.
    // Query-string forms (`?provider=x`) caused live failures (Intuit rejected
    // "redirect_uri query parameter value is invalid" when the registered URI
    // and the sent URI differed). Every redirect-URI builder must use
    // `${origin}/api/oauth/callback/{providerId}` — no query strings anywhere.
    const offenders: string[] = [];
    const scanFile = (full: string): void => {
      const source = readFileSync(full, "utf8");
      if (QUERY_STRING_REDIRECT.test(source)) offenders.push(full);
    };
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "test" || entry.name.startsWith(".")) continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          scanFile(full);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    scanFile(join(process.cwd(), "prod-server.ts"));
    expect(offenders, `query-string redirect URIs found in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("builds redirect URIs path-style in prod-server (canonical callback/{provider})", () => {
    const source = readFileSync(join(process.cwd(), "prod-server.ts"), "utf8");
    // The single source of truth for redirect-URI construction must embed the
    // provider slug in the PATH — never a bare callback with query params, and
    // never a provider-specific special path in the BUILDER. (The inbound
    // /api/xero-callback route ALIAS is intentional backward-compat for
    // in-flight redirects and is not a redirect-URI construction.)
    expect(source).toMatch(/api\/oauth\/callback\/\$\{provider\}/);
    expect(source).not.toMatch(/return\s+`\$\{base\}\/api\/xero-callback`/);
  });

  it("builds the canonical path-style redirectUri for known provider ids (no query string)", () => {
    // Owner-facing guarantee (QBO unblock): for every provider the sent
    // redirect_uri is `${SITE_ORIGIN}/api/oauth/callback/${providerId}` — exact
    // string a provider console must register, never a ?provider= form.
    const source = readFileSync(join(process.cwd(), "prod-server.ts"), "utf8");
    const providers = ["xero", "quickbooks-enterprise", "quickbooks-online", "quickbooks", "salesforce", "google"];
    const SITE_ORIGIN = "https://simplerlife100.ctonew.app";
    for (const providerId of providers) {
      const built = `${SITE_ORIGIN}/api/oauth/callback/${providerId}`;
      expect(built).toBe(`${SITE_ORIGIN}/api/oauth/callback/${providerId}`);
      expect(built).not.toContain("?");
      expect(built.endsWith(`/api/oauth/callback/${providerId}`)).toBe(true);
    }
    // The builder template must embed the provider slug in the path.
    expect(source).toMatch(/api\/oauth\/callback\/\$\{provider\}/);
    expect(source).not.toMatch(/oauth\/callback\?provider=/);
  });
});
