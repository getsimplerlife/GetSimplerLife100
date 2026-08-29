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
// button, so it is NOT in this list; the "Scale misused as a <$2,500> Blueprint CTA"
// regression is instead guarded by pricing-blueprint-checkout.test.ts (PR #206),
// which asserts the Blueprint button href is the canonical 14Ab… link. Only links
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

  it("the canonical Build Package + Blueprint links are present in pricing.tsx", () => {
    const p = readFileSync("src/routes/pricing.tsx", "utf8");
    expect(p).toContain(CANONICAL.starter);
    expect(p).toContain(CANONICAL.growth);
    expect(p).toContain(CANONICAL.scale);
    expect(p).toContain(CANONICAL.blueprint);
  });

  it("the canonical Connection-Pack links survive in stripe-webhook.ts", () => {
    const w = readFileSync("src/lib/stripe-webhook.ts", "utf8");
    expect(w).toContain(CANONICAL.crmPack);
    expect(w).toContain(CANONICAL.erpPack);
  });

  it("the canonical support links survive in support.tsx", () => {
    const s = readFileSync("src/routes/support.tsx", "utf8");
    expect(s).toContain(CANONICAL.supportEssential);
    expect(s).toContain(CANONICAL.supportProfessional);
  });

  it("the assessment 'Purchase Audit' button uses the canonical $2,500 link, not the $25 one", () => {
    const a = readFileSync("src/lazy/assessment.page.tsx", "utf8");
    // It must contain the canonical link...
    expect(a).toContain(CANONICAL.blueprint);
    // ...and NOT the wrong $25 link.
    expect(a).not.toContain(BAD_LINKS[0]);
  });
});
