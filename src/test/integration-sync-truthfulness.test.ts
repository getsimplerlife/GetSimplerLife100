import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Legacy integration sync truthfulness (cleanup a2).
 *
 * The persistent-connect era registered /api/integrations/:id/sync and
 * /api/integrations/:id/logs on the server. Both are RETIRED with a2 — the
 * single Bun server (prod-server.ts) no longer registers them anywhere, and
 * the old unmounted src/api router that mirrored them is no longer dispatched
 * (only /api/integrations/providers survives on the live server).
 *
 * This truthfulness pin asserts: (a) the sync/logs surfaces are absent from
 * the server, and (b) no surviving product surface relabels stored rows as
 * "Connected" or claims a sync outcome that was never verified.
 */
const REPO = existsSync(join(process.cwd(), "prod-server.ts"))
  ? process.cwd()
  : join(process.cwd(), "..", "..");

function cat(rel: string): string {
  const p = join(REPO, rel);
  return existsSync(p) ? readFileSync(p, "utf-8") : "";
}

describe("legacy integration sync truthfulness (a2 — sync surface retired)", () => {
  it("sync/logs endpoints are gone and nothing relabels stored rows Connected without verification", () => {
    const server = cat("prod-server.ts");
    // a2: both endpoints are retired from the one Bun server.
    expect(server.includes("/api/integrations/:id/sync")).toBe(false);
    expect(server.includes("/api/integrations/:id/logs")).toBe(false);
    expect(server.includes("/api/integrations/sync")).toBe(false);
    // The only surviving /api/integrations* mount is the providers catalog:
    // no bare conn-list dispatch remains on the server.
    expect(server.includes('"/api/integrations"')).toBe(false);

    // Product surfaces: the Import History / connected-accounts / settings
    // surfaces never relabel stored rows as "Connected" nor claim a sync.
    const surfaces = [
      "src/lazy/portal.integrations.index.page.tsx",
      "src/lazy/portal.connected-accounts.index.page.tsx",
      "src/lazy/portal.settings.index.page.tsx",
    ]
      .map(cat)
      .join("\n");
    expect(surfaces.includes("marked as Connected")).toBe(false);
    expect(surfaces.includes("last synced")).toBe(false);
    expect(surfaces.toLowerCase().includes("synced successfully")).toBe(false);
  });
});