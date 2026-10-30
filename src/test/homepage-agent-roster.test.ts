/**
 * homepage pricing-band test (reworked for LOCKED platform tiers, owner 09-27;
 * updated for cleanup slice (c), 10-26).
 * The old "Monthly per AI Employee" roster is GONE from the homepage — the
 * homepage now shows the three locked platform tiers (Starter/Growth/
 * Enterprise, monthly + onboarding), with no per-employee selling. Since
 * slice (c), the AI-employee runtime catalog (src/data/agents.ts) is also
 * RETIRED — the module must not come back, and the homepage must still not
 * sell per-employee.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const REPO = process.cwd();
const homeSource = readFileSync(join(REPO, "src/routes/index.tsx"), "utf8");

describe("homepage platform-tier pricing band", () => {
  it("the AI-employee catalog module is retired (cleanup slice c)", () => {
    // slice (c): the global ai_employees.json + its seed module (the 17-agent
    // catalog with per-agent prices/payment links) are deleted. Asserting the
    // file is GONE keeps the zero-cross-tenant-file guarantee literal.
    expect(existsSync(join(REPO, "src/data/agents.ts"))).toBe(false);
  });

  it("homepage shows the LOCKED platform tiers (monthly, no setup fee), not per-employee cards", () => {
    expect(homeSource).toContain("$199/mo");
    expect(homeSource).toContain("$599/mo");
    expect(homeSource).toContain("$1,499/mo");
    // Setup fees were removed by owner decision 10-30: the band states the
    // onboarding that IS included, and never a one-time fee.
    expect(homeSource).toContain("onboarding included");
    expect(homeSource).not.toContain("setup included");
  });

  it("homepage no longer sells per-employee (no roster, no AGENTS.map, no old package prices)", () => {
    expect(homeSource).not.toMatch(/AGENTS\.map\(/);
    expect(homeSource).not.toContain("$7,500");
    expect(homeSource).not.toContain("$15,000");
    expect(homeSource).not.toContain("$30,000");
    expect(homeSource).not.toMatch(/Monthly per AI Employee|per AI employee/);
  });
});