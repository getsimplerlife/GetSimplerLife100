import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const providersDir = join(process.cwd(), "src/integrations/providers");
const oauthFiles = readdirSync(providersDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(providersDir, entry.name, "auth.ts"))
  .filter((file) => readFileSync(file, "utf8").match(/OAuthConfig|flowType/));

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
});
