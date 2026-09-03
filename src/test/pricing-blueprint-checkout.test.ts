/**
 * pricing-blueprint-checkout.test.ts — regression guardrail for the
 * $2,500 entry on /pricing (site name "Automation Sprint"; Stripe catalog
 * name "Industry Blueprint Assessment" — the owner renames the catalog).
 *
 * Bug (d40f2677): the $2,500 Blueprint button's href pointed at
 * aFa7sN60LdErc1B5HG2Fa2M — the SAME Stripe Payment Link as the $30,000
 * Scale Build Package. A customer clicking "Get Your Blueprint" expecting
 * $2,500 landed on a $30,000 checkout.
 *
 * Fix: the $2,500 button now points at its own real $2,500 Blueprint
 * Payment Link (https://buy.stripe.com/14AbJ3cp91VJc1Bfig2Fa2N, generated
 * from price_1Tv7GiRcz95wEmJa2nEHrpaZ / prod_UuxBKQU2FvfQsB).
 *
 * SITE P3 rework: the section is now the low-risk "Automation Sprint" entry.
 * Truthfulness: the site calls it "Automation Sprint" but the Stripe
 * catalog/checkout still shows "Industry Blueprint Assessment" (the owner's
 * rename step) — so the CTA must link to the canonical $2,500 link AND the
 * page must disclose the checkout label to avoid implying the checkout says
 * "Automation Sprint".
 *
 * These assertions read the source of src/routes/pricing.tsx (source of
 * truth) so any future accidental re-binding of the $2,500 CTA to Scale's
 * link — or removal of the checkout-label disclosure — fails CI immediately.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PRICING = readFileSync("src/routes/pricing.tsx", "utf8");

const SCALE_LINK = "https://buy.stripe.com/aFa7sN60LdErc1B5HG2Fa2M";
const BLUEPRINT_LINK = "https://buy.stripe.com/14AbJ3cp91VJc1Bfig2Fa2N";

describe("pricing $2,500 Automation Sprint checkout button", () => {
  it("Sprint CTA points at the real $2,500 Blueprint link (not Scale's $30k link)", () => {
    // The Sprint block in /pricing: find the "Start the Sprint" CTA and
    // assert its href is the canonical $2,500 link.
    const sprintIdx = PRICING.indexOf("Start the Sprint");
    expect(sprintIdx).toBeGreaterThan(0);
    const sprintBlock = PRICING.slice(0, sprintIdx);
    const hrefIn = sprintBlock.lastIndexOf("href=");
    expect(hrefIn).toBeGreaterThan(0);
    const href = (sprintBlock.slice(hrefIn).match(/href="([^"]+)"/) || [])[1];
    expect(href).toBe(BLUEPRINT_LINK);
    // Critically, it must NOT be Scale's link.
    expect(href).not.toBe(SCALE_LINK);
  });

  it("Sprint block advertises $2,500, names 'Automation Sprint', and discloses the checkout label", () => {
    const sprintIdx = PRICING.indexOf('href="' + BLUEPRINT_LINK + '"');
    expect(sprintIdx).toBeGreaterThan(0);
    const block = PRICING.slice(0, sprintIdx);
    expect(block).toContain("$2,500");
    expect(block).toContain("Automation Sprint");
    // Truthfulness: the site names it Automation Sprint, and the checkout
    // is disclosed as "Industry Blueprint Assessment" — the catalog name
    // the owner will rename in Stripe.
    expect(PRICING).toContain('At checkout you\'ll see the item as "Industry Blueprint Assessment"');
    expect(PRICING).toContain("the same $2,500 one-time engagement");
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