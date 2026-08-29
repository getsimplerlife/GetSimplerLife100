/**
 * pricing-blueprint-checkout.test.ts — regression guardrail for the
 * "Industry Blueprint Assessment" checkout button on /pricing.
 *
 * Bug (d40f2677): the $2,500 Blueprint button's href pointed at
 * aFa7sN60LdErc1B5HG2Fa2M — the SAME Stripe Payment Link as the $30,000
 * Scale Build Package. A customer clicking "Get Your Blueprint" expecting
 * $2,500 landed on a $30,000 checkout.
 *
 * Fix: the Blueprint button now points at its own real $2,500 Blueprint
 * Payment Link (https://buy.stripe.com/14AbJ3cp91VJc1Bfig2Fa2N, generated
 * from price_1Tv7GiRcz95wEmJa2nEHrpaZ / prod_UuxBKQU2FvfQsB).
 *
 * These assertions read the source of src/routes/pricing.tsx (source of
 * truth) so any future accidental re-binding of Blueprint to Scale's link
 * fails CI immediately.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PRICING = readFileSync("src/routes/pricing.tsx", "utf8");

const SCALE_LINK = "https://buy.stripe.com/aFa7sN60LdErc1B5HG2Fa2M";
const BLUEPRINT_LINK = "https://buy.stripe.com/14AbJ3cp91VJc1Bfig2Fa2N";

describe("pricing Blueprint checkout button", () => {
  it("Blueprint button points at the real $2,500 Blueprint link (not Scale's $30k link)", () => {
    // The Blueprint block in /pricing: find the "Get Your Blueprint" CTA and
    // assert its href is the canonical Blueprint link.
    const blueprintIdx = PRICING.indexOf("Get Your Blueprint");
    expect(blueprintIdx).toBeGreaterThan(0);
    const blueprintBlock = PRICING.slice(0, blueprintIdx);
    const hrefIn = blueprintBlock.lastIndexOf("href=");
    expect(hrefIn).toBeGreaterThan(0);
    const href = (blueprintBlock.slice(hrefIn).match(/href="([^"]+)"/) || [])[1];
    expect(href).toBe(BLUEPRINT_LINK);
    // Critically, it must NOT be Scale's link.
    expect(href).not.toBe(SCALE_LINK);
  });

  it("Blueprint block still advertises $2,500 with the same CTA", () => {
    const blueprintIdx = PRICING.indexOf('href="' + BLUEPRINT_LINK + '"');
    expect(blueprintIdx).toBeGreaterThan(0);
    const block = PRICING.slice(0, blueprintIdx);
    expect(block).toContain("$2,500");
    expect(PRICING).toContain("Get Your Blueprint →");
    expect(PRICING).toContain("Industry Blueprint Assessment");
  });

  it("Scale button still points at the $30,000 Scale link", () => {
    // Scale's link lives in the builderTiers array as link: "...", price 30000.
    const scaleIdx = PRICING.indexOf('{ name: "Scale"');
    expect(scaleIdx).toBeGreaterThan(0);
    const scaleObj = PRICING.slice(
      scaleIdx,
      PRICING.indexOf("};", scaleIdx),
    );
    expect(scaleObj).toContain("price: 30000");
    expect(scaleObj).toContain('link: "' + SCALE_LINK + '"');
  });

  it("Blueprint is a distinct buy.stripe.com URL from Scale", () => {
    // The two links resolve to different paths under buy.stripe.com.
    const bp = new URL(BLUEPRINT_LINK);
    const sc = new URL(SCALE_LINK);
    expect(bp.pathname).not.toBe(sc.pathname);
    expect(BLUEPRINT_LINK).toContain("buy.stripe.com/");
    expect(SCALE_LINK).toContain("buy.stripe.com/");
  });
});
