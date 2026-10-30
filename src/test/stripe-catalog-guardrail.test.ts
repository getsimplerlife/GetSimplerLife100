/**
 * stripe-catalog-guardrail.test.ts — catalog cleanup guardrail (task bcc3f353).
 *
 * Purpose: fail loudly if the LIVE (customer-facing) site ever references a
 * wrong-priced, duplicate, or test/placeholder Stripe checkout link again.
 *
 * Background: the Stripe catalog has accumulated duplicate and wrong-unit
 * products across several generation passes (07-13, 07-19, 07-20, 07-26/27).
 * The website sells via HARDCODED buy.stripe.com Payment Links in
 * src/routes, src/components, src/lazy and src/lib (see
 * /home/team/shared/STRIPE_CATALOG_CLEANUP.md). Two real bugs shipped from
 * wrong-unit links:
 *   - PR #206: the $2,500 Blueprint button pointed at the $30k Scale link.
 *   - This PR: the assessment "Purchase Audit — $2,500" button pointed at
 *     fZufZj2OzdEr6Hh0nm2Fa00 which renders "$25.00".
 *
 * These assertions read ONLY customer-facing sources (src/routes, src/components,
 * src/lazy, src/lib). src/test/** and src/integrations/** legitimately contain
 * test_* / placeholder strings for test fixtures and fail-closed provider stubs,
 * so they are intentionally excluded from the "no placeholder" checks.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CUST_DIRS = ["src/routes", "src/components", "src/lazy", "src/lib"];

// Known-WRONG links that must NEVER appear in a customer-facing checkout button.
// NOTE: the $30k Scale link (aFa7sN60…) legitimately appears on the Scale package
// button, so it is NOT in this list; the retired $2,500 Sprint/Blueprint link
// (14Ab…) is instead guarded by pricing-blueprint-checkout.test.ts +
// automation-sprint-retirement.test.ts, which assert the retired link is ABSENT
// from /pricing and the user-facing surface (owner 10-21 retirement). Only links
// that are wrong at ANY use go here.
const BAD_LINKS = [
  "buy.stripe.com/fZufZj2OzdEr6Hh0nm2Fa00", // $25 wrong-unit Blueprint/Audit (was on the assessment page)
];

// Canonical links (correct price) that the live site depends on — must keep resolving.
const CANONICAL = {
  starter: "3cI8wR88Tasfc1B9XW2Fa2K",
  growth: "5kQ6oJbl5dErc1B1rq2Fa2L",
  scale: "aFa7sN60LdErc1B5HG2Fa2M",
  blueprint: "14AbJ3cp91VJc1Bfig2Fa2N",
  crmPack: "5kQaEZ60LcAn8Ppgmk2Fa2I",
  erpPack: "dRmeVf88TfMzghRda82Fa2J",
  supportEssential: "8x24gB3SD2ZNd5Fc642Fa1I",
  supportProfessional: "aFaaEZexhasf3v50nm2Fa1J",
};

function customerFiles(): string[] {
  const out: string[] = [];
  for (const d of CUST_DIRS) {
    const abs = join(process.cwd(), d);
    for (const f of readdirSync(abs)) {
      if (/\.(tsx?|ts)$/.test(f) && statSync(join(abs, f)).isFile()) out.push(join(d, f));
    }
  }
  return out;
}
const FILES = customerFiles();

describe("stripe catalog guardrail (customer-facing checkout links)", () => {
  it("no known-wrong link is used in a customer-facing file", () => {
    for (const file of FILES) {
      const text = readFileSync(file, "utf8");
      for (const bad of BAD_LINKS) {
        expect(text, `${file} must not contain wrong link ${bad}`).not.toContain(bad);
      }
    }
  });

  it("no test/placeholder buy.stripe.com link leaks into a customer-facing file", () => {
    const leakRe = /buy\.stripe\.com\/(test_|nonexistent|\/x\b|OTHER)/;
    for (const file of FILES) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} must not contain a test/placeholder checkout link`).not.toMatch(leakRe);
    }
  });

  it("the retired Sprint (Blueprint) link is ABSENT from pricing.tsx; discontinued per-employee build-package links are NOT sold there (owner 09-27 locked tiers; owner 10-21 retirement)", () => {
    const p = readFileSync("src/routes/pricing.tsx", "utf8").toLowerCase();
    // The $2,500 Sprint/Blueprint one-time SKU is RETIRED (owner 10-21) — its
    // legacy Stripe link and product names must not appear on the pricing page.
    expect(p).not.toContain(CANONICAL.blueprint.toLowerCase());
    expect(p).not.toContain("automation sprint");
    expect(p).not.toContain("industry blueprint");
    expect(p).not.toContain("$2,500");
    // The old per-employee build packages were DISCONTINUED (owner 09-27) — their
    // Stripe links must not be bound to any CTA on the pricing page anymore.
    const pRaw = readFileSync("src/routes/pricing.tsx", "utf8");
    expect(pRaw).not.toContain(CANONICAL.starter);
    expect(pRaw).not.toContain(CANONICAL.growth);
    expect(pRaw).not.toContain(CANONICAL.scale);
    // But the runtime (stripe-webhook) still maps legacy purchases via those links.
    const w = readFileSync("src/lib/stripe-webhook.ts", "utf8");
    expect(w).toContain(CANONICAL.starter);
    expect(w).toContain(CANONICAL.growth);
    expect(w).toContain(CANONICAL.scale);
  });
  it("pricing.tsx tier cards link to the three live locked-tier Stripe payment links and open checkout in a new tab (owner 09-27 platform pricing)", () => {
    const p = readFileSync("src/routes/pricing.tsx", "utf8");
    // The three locked platform tiers each carry a buy button bound to its
    // matching live Stripe Payment Link (the ONLY products/prices/links on the
    // standard account after the 09-27 full-standard switch).
    const platform = {
      starter: "https://buy.stripe.com/eVq5kC7qQ0909zV0sJ5os00",
      growth: "https://buy.stripe.com/fZubJ0h1qbRI5jFcbr5os01",
      enterprise: "https://buy.stripe.com/fZu28qfXmaNEdQb2AR5os02",
    };
    expect(p).toContain('cta: "Choose Starter"');
    expect(p).toContain('cta: "Choose Growth"');
    expect(p).toContain('cta: "Choose Enterprise"');
    expect(p).toContain(`ctaHref: "${platform.starter}"`);
    expect(p).toContain(`ctaHref: "${platform.growth}"`);
    expect(p).toContain(`ctaHref: "${platform.enterprise}"`);
    // Checkout is Stripe-hosted, so the tier CTA must open it in a new tab.
    expect(p).toContain('target="_blank"');
    expect(p).toContain('rel="noopener noreferrer"');
  });

  it("the retired Connection-Pack links are GONE from stripe-webhook.ts (retired 10-21, code removed 10-30)", () => {
    // Neither pack payment link exists in the live Stripe account (verified
    // 10-30: exactly three payment links, the platform tiers), so the pack
    // detection helpers and their link constants were deleted rather than
    // kept as a mapping that could never fire truthfully.
    const w = readFileSync("src/lib/stripe-webhook.ts", "utf8");
    expect(w).not.toContain(CANONICAL.crmPack);
    expect(w).not.toContain(CANONICAL.erpPack);
    // Pin the DECLARATIONS, not the bare words: the module header still
    // explains what was retired, so a plain substring pin would self-fail.
    for (const decl of [
      "export const CRM_PACK_LINK",
      "export const ERP_PACK_LINK",
      "export const PACKS_BY_LINK",
      "export const PACK_SLOTS",
      "export function detectPackType",
      "export function buildPackPurchase",
      "export interface PackSpec",
      "export type PackType",
    ]) {
      expect(w, `stripe-webhook.ts still declares: ${decl}`).not.toContain(decl);
    }
  });

  it("support.tsx no longer sells the discontinued per-employee support SKUs (owner 09-27 locked platform tiers)", () => {
    // Support is now included in the platform tiers (Starter/Growth/Enterprise).
    // The old standalone support plans (Essential $750 / Professional $2,000 / Enterprise
    // $5,000 per month) were discontinued with the per-employee model, so their Stripe
    // Payment Links must no longer appear on the customer-facing support page.
    const s = readFileSync("src/routes/support.tsx", "utf8");
    expect(s).not.toContain(CANONICAL.supportEssential);
    expect(s).not.toContain(CANONICAL.supportProfessional);
    expect(s).not.toContain("$750");
    expect(s).not.toContain("$2,000");
    expect(s).not.toContain("$5,000");
    // Support tiers now mirror the locked platform structure.
    expect(s).toContain("monthly: '$199'");
    expect(s).toContain("monthly: '$599'");
    expect(s).toContain("monthly: '$1,499'");
  });

  it("the assessment page no longer sells a paid audit (owner 10-21 retirement — free assessment only)", () => {
    const a = readFileSync("src/lazy/assessment.page.tsx", "utf8").toLowerCase();
    expect(a).not.toContain(CANONICAL.blueprint.toLowerCase());
    expect(a).not.toContain("purchase audit");
    expect(a).not.toContain("$2,500");
    expect(a).not.toContain("deep-dive");
    expect(a).not.toContain(BAD_LINKS[0]);
  });
});
