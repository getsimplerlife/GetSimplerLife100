/**
 * homepage pricing-band test (reworked for LOCKED platform tiers, owner 09-27).
 * The old "Monthly per AI Employee" roster is GONE from the homepage — the
 * homepage now shows the three locked platform tiers (Starter/Growth/Enterprise,
 * monthly + onboarding), with no per-employee selling.
 *
 * src/data/agents.ts remains the canonical RUNTIME data module (purchase
 * provisioning still materializes agents per Stripe product metadata), so we
 * keep guarding it for its own integrity — but the public homepage must NOT
 * sell per-employee anymore.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { AGENTS } from "../data/agents";

const homeSource = readFileSync("src/routes/index.tsx", "utf8");
const agentsSource = readFileSync("src/data/agents.ts", "utf8");

describe("homepage platform-tier pricing band", () => {
  it("canonical runtime data source still exposes the catalog agents (runtime module, not sold per-employee)", () => {
    expect(AGENTS.length).toBe(17);
    expect(agentsSource).toContain('price: 950');
    expect(agentsSource).toContain('price: 2000');
  });

  it("homepage shows the LOCKED platform tiers (monthly + onboarding), not per-employee cards", () => {
    expect(homeSource).toContain("$199/mo");
    expect(homeSource).toContain("$599/mo");
    expect(homeSource).toContain("$1,499/mo");
    expect(homeSource).toContain("setup included");
  });

  it("homepage no longer sells per-employee (no roster, no AGENTS.map, no old package prices)", () => {
    expect(homeSource).not.toMatch(/AGENTS\.map\(/);
    expect(homeSource).not.toContain("$7,500");
    expect(homeSource).not.toContain("$15,000");
    expect(homeSource).not.toContain("$30,000");
    expect(homeSource).not.toMatch(/Monthly per AI Employee|per AI employee/);
  });
});
