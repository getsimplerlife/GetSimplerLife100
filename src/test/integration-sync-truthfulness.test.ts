import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("legacy integration sync truthfulness", () => {
  it("does not relabel stored connections Connected or claim synced without verification", () => {
    const source = readFileSync("prod-server.ts", "utf8");
    const start = source.indexOf("// ── /api/integrations/:id/sync & /api/integrations/:id DELETE");
    const end = source.indexOf("// ── /api/integrations/:id/logs GET", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const syncRoutes = source.slice(start, end);
    expect(syncRoutes).toContain("verificationRequired: true");
    expect(syncRoutes).toContain("synced: false");
    expect(syncRoutes).toContain("no request was made");
    expect(syncRoutes).not.toMatch(/conn\.status\s*=\s*["']Connected["']/);
    expect(syncRoutes).not.toMatch(/conn\.lastSync\s*=/);
    expect(syncRoutes).not.toContain("synced: true");
  });
});
