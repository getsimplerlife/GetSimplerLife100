/**
 * retired-product-cleanup guard (slice 136, 2026-10-30).
 *
 * The owner retired two SKUs that the live server still carried:
 *   - "Connection Packs" (CRM/ERP) — retired 2026-10-21
 *   - the $2,500 Sprint / Industry Blueprint one-time engagement — retired 10-21
 *
 * Verified 2026-10-30 against the live Stripe account: it holds EXACTLY three
 * payment links (Starter / Growth / Enterprise) and neither pack link nor the
 * Blueprint link exists there. No customer is affected — Stripe shows zero
 * transactions ever, so nobody ever bought one of these.
 *
 * This guard pins the removal at the source:
 *   1. the /api/portal/pack-slot redemption route is gone from the server;
 *   2. src/lib/plan-pack-slot.ts and its test are deleted;
 *   3. stripe-webhook.ts declares none of the pack helpers/constants;
 *   4. the per-plan agent grant helper (per-agent gating, banned) is gone;
 *   5. the retired link ids (pack links, 14AbJ Blueprint, 4gMfZ) appear in NO
 *      source file outside src/test;
 *   6. the customer-facing surfaces carry EXACTLY the three live tier links.
 *
 * Note on the plan-link constants (updated 10-30, follow-up to this slice):
 * STARTER/GROWTH/ENTERPRISE_PLAN_LINK in src/lib/stripe-webhook.ts are now the
 * three LIVE tier links (eVq5kC7q / fZubJ0h1 / fZu28qfX — re-verified live
 * 10-30). The old per-employee links (3cI8wR88 / 5kQ6oJbl / aFa7sN60) do not
 * exist in the live account and no longer map at all, so a purchase today is
 * recorded with its real tier instead of as an untiered generic purchase.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPO = existsSync(join(process.cwd(), "prod-server.ts")) ? process.cwd() : join(process.cwd(), "..", "..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

const PRODUCT_ROOTS = ["src/routes", "src/content", "src/components", "src/lazy", "src/native"];

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(dir, name);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(abs, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(abs);
  }
}

/** Every .ts/.tsx under src/, EXCLUDING src/test (tests legitimately name the retired ids). */
function srcOutsideTests(): string[] {
  const hits: string[] = [];
  walk(join(REPO, "src"), hits);
  return hits.filter((f) => !f.includes(`${join("src", "test")}`));
}

const productFiles = (): string[] => {
  const hits: string[] = [];
  for (const root of PRODUCT_ROOTS) walk(join(REPO, root), hits);
  return hits;
};

const LIVE_TIER_LINKS = [
  "https://buy.stripe.com/eVq5kC7qQ0909zV0sJ5os00", // Starter  $199/mo + $500 setup
  "https://buy.stripe.com/fZubJ0h1qbRI5jFcbr5os01", // Growth   $599/mo + $1,500 setup
  "https://buy.stripe.com/fZu28qfXmaNEdQb2AR5os02", // Enterprise $1,499/mo
];

/** Ids that must not exist anywhere in product/source code any more. */
const RETIRED_LINK_IDS = [
  "5kQaEZ60LcAn8Ppgmk2Fa2I", // CRM Connection Pack (never in the live account)
  "dRmeVf88TfMzghRda82Fa2J", // ERP Connection Pack (never in the live account)
  "14AbJ", // $2,500 Sprint / Industry Blueprint (retired 10-21)
  "4gMfZ", // second retired Blueprint-era id
];

describe("retired product — Connection Pack redemption route is gone", () => {
  it("prod-server.ts has no /api/portal/pack-slot handler", () => {
    const server = read("prod-server.ts");
    expect(server).not.toContain("/api/portal/pack-slot");
    expect(server).not.toContain("portal.pack-slot.choose");
    expect(server).not.toContain("plan-pack-slot");
  });

  it("src/lib/plan-pack-slot.ts and its test are deleted", () => {
    expect(existsSync(join(REPO, "src/lib/plan-pack-slot.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/test/plan-pack-slot.test.ts"))).toBe(false);
  });

  it("the plan purchase branch survives and records no per-agent fields", () => {
    const server = read("prod-server.ts");
    // The plan branch is live code — it must keep provisioning.
    expect(server).toContain("detectPlanType(paymentLink)");
    expect(server).toContain("buildPlanPurchase(planSpec, amountTotal, session.id)");
    // Per-agent gating (banned) is gone: no grant helper, no stamp.
    expect(server).not.toContain("planAgentIds");
    expect(server).not.toContain("agentIds");
  });
});

describe("retired product — pack helpers and dead link ids are out of the source", () => {
  it("stripe-webhook.ts declares no pack symbol", () => {
    const w = read("src/lib/stripe-webhook.ts");
    for (const decl of [
      "export const CRM_PACK_LINK",
      "export const ERP_PACK_LINK",
      "export const PACKS_BY_LINK",
      "export const PACK_SLOTS",
      "export function detectPackType",
      "export function buildPackPurchase",
      "export interface PackSpec",
      "export type PackType",
      "export function planAgentIds",
    ]) {
      expect(w, `stripe-webhook.ts still declares: ${decl}`).not.toContain(decl);
    }
    // The live path is preserved.
    expect(w).toContain("export function verifyStripeSignature");
    expect(w).toContain("export function detectPlanType");
    expect(w).toContain("export function buildPlanPurchase");
  });

  it("no retired link id appears in any source file outside src/test", () => {
    const files = [...srcOutsideTests(), join(REPO, "prod-server.ts")];
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const id of RETIRED_LINK_IDS) {
        if (text.includes(id)) hits.push(`${f.replace(REPO + "/", "")} → ${id}`);
      }
    }
    expect(hits, `retired Stripe ids still in source: ${hits.join(", ")}`).toEqual([]);
  });

  it("no retired product name appears in the customer-facing product surfaces", () => {
    // Pack-era and Sprint-era copy must not reach a buyer.
    const banned = [/Connection Pack/i, /Industry Blueprint/i, /Automation Sprint/i, /\$2,500/];
    const hits: string[] = [];
    for (const f of productFiles()) {
      const text = readFileSync(f, "utf8");
      for (const re of banned) {
        if (re.test(text)) hits.push(`${f.replace(REPO + "/", "")} → ${re}`);
      }
    }
    expect(hits, `retired product copy in product surfaces: ${hits.join(", ")}`).toEqual([]);
  });
});

describe("buy links — the customer-facing surfaces carry EXACTLY the three live tiers", () => {
  it("every buy.stripe.com link on a product surface is one of the three locked tiers", () => {
    const found = new Set<string>();
    for (const f of productFiles()) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]+/g)) found.add(m[0]);
    }
    expect([...found].sort()).toEqual([...LIVE_TIER_LINKS].sort());
  });

  it("the three live tier links are each wired on the pricing page", () => {
    const pricing = read("src/routes/pricing.tsx");
    for (const link of LIVE_TIER_LINKS) expect(pricing).toContain(link);
  });

  it("the retired per-employee tier links appear in NO source file, and the live tiers are what maps", () => {
    const legacy = ["3cI8wR88Tasfc1B9XW2Fa2K", "5kQ6oJbl5dErc1B1rq2Fa2L", "aFa7sN60LdErc1B5HG2Fa2M"];
    const files = [...srcOutsideTests(), join(REPO, "prod-server.ts")];
    const hits: string[] = [];
    for (const f of files) {
      const rel = f.replace(REPO + "/", "");
      const text = readFileSync(f, "utf8");
      for (const id of legacy) if (text.includes(id)) hits.push(`${rel} → ${id}`);
    }
    expect(hits, `retired per-employee tier links still in source: ${hits.join(", ")}`).toEqual([]);
    // And they are not on any customer-facing surface either.
    for (const f of productFiles()) {
      const text = readFileSync(f, "utf8");
      for (const id of legacy) expect(text.includes(id), `${f} carries ${id}`).toBe(false);
    }
    // The live tier links ARE what the webhook maps, so a purchase today is
    // recorded as a real tier rather than an untiered generic purchase.
    const w = read("src/lib/stripe-webhook.ts");
    for (const link of LIVE_TIER_LINKS) expect(w, `stripe-webhook.ts does not map ${link}`).toContain(link);
    const server = read("prod-server.ts");
    expect(server).toContain("detectPlanTierFromMetadata(session.metadata?.tier)");
  });
});
