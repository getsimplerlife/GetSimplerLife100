/**
 * pricing-blueprint-checkout.test.ts — retired one-time SKU guardrail (owner 10-21).
 * The $2,500 Automation Sprint / "Industry Blueprint Assessment" / "Deep-Dive AI
 * Opportunity Audit" one-time SKU is RETIRED: the three locked platform tiers
 * (Starter/Growth/Enterprise) are the ONLY SKUs, and the free assessment is the
 * sole low-risk entry. /pricing must therefore carry NO Sprint/Blueprint surface
 * and NO buy.stripe.com link other than the three tier payment links.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const PRICING = readFileSync("src/routes/pricing.tsx", "utf8").toLowerCase();
const TIER_LINKS = [
  "https://buy.stripe.com/eVq5kC7qQ0909zV0sJ5os00",
  "https://buy.stripe.com/fZubJ0h1qbRI5jFcbr5os01",
  "https://buy.stripe.com/fZu28qfXmaNEdQb2AR5os02",
];
const SCALE_LINK = "https://buy.stripe.com/aFa7sN60LdErc1B5HG2Fa2M";
const RETIRED_BLUEPRINT_LINK = "https://buy.stripe.com/14AbJ3cp91VJc1Bfig2Fa2N";

describe("pricing page: retired one-time SKU surface is gone (owner 10-21)", () => {
  it("contains no Automation Sprint / $2,500 / Industry Blueprint Assessment / retired link", () => {
    expect(PRICING).not.toContain("automation sprint");
    expect(PRICING).not.toContain("$2,500");
    expect(PRICING).not.toContain("industry blueprint");
    expect(PRICING).not.toContain(RETIRED_BLUEPRINT_LINK);
    expect(PRICING).not.toContain("start the sprint");
  });
  it("the ONLY buy.stripe.com links on /pricing are the three locked tier payment links", () => {
    const links = [...PRICING.matchAll(/buy\.stripe\.com\/[a-z0-9]+/g)].map((m) => "https://" + m[0]);
    expect(new Set(links)).toEqual(new Set(TIER_LINKS));
  });
  it("no discontinued per-employee / build-package SKUs remain (owner 09-27 locked tiers)", () => {
    expect(PRICING).not.toContain("price: 30000");
    expect(PRICING).not.toContain("price: 7500");
    expect(PRICING).not.toContain("price: 15000");
    expect(PRICING).not.toContain(SCALE_LINK.toLowerCase());
  });
  it("the free assessment remains the low-risk entry — /pricing links to it", () => {
    expect(PRICING).toContain('to="/assessment"');
  });
});