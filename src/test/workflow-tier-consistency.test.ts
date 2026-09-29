/**
 * workflow-tier-consistency.test.ts — regression guardrail for the visual
 * redesign pass (lead ask): the /workflows library index (automationLibrary,
 * difficulty-based) and the /workflows/$id detail pages (content/workflows,
 * priceTier-based) must label the SAME workflow with the SAME locked platform
 * tier. Before this guardrail, e.g. "Invoice Processing Automation" showed
 * Growth/$599 in the library but Starter/$199 on the detail page.
 *
 * The shared resolver (src/content/workflow-tiers.ts) resolves the detail tier
 * BY NAME against the library difficulty mapping, so the two surfaces agree by
 * construction. These assertions keep both surfaces honest and lock the three
 * owner-locked Stripe links + prices.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { automationLibrary } from "../content/automation-library";
import { workflows } from "../content/workflows";
import { TIER_META, resolveWorkflowTier, tierFromDifficulty } from "../content/workflow-tiers";

const libraryByName = new Map(automationLibrary.map((c) => [c.name, c]));

describe("workflow tier consistency — library vs detail surfaces", () => {
  it("every detail workflow that also exists in the library resolves to the library's tier", () => {
    const mismatches: string[] = [];
    for (const wf of workflows) {
      const libCard = libraryByName.get(wf.name);
      if (!libCard) continue; // no library twin — no cross-surface conflict
      const libraryTier = tierFromDifficulty(libCard.difficulty);
      const resolved = resolveWorkflowTier(wf.name, wf.priceTier);
      if (resolved !== libraryTier) {
        mismatches.push(`${wf.name}: library=${libraryTier} resolved=${resolved} stored=${wf.priceTier}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("the resolver covers cross-surface workflows (library twin exists for the detail dataset)", () => {
    // Guard against the empty case: the lead's example must be covered.
    const invoice = workflows.find((w) => w.name === "Invoice Processing Automation");
    expect(invoice).toBeTruthy();
    expect(libraryByName.get("Invoice Processing Automation")?.difficulty).toBe("medium");
    expect(resolveWorkflowTier("Invoice Processing Automation", invoice!.priceTier)).toBe("growth");
  });
});

describe("locked platform tiers — one pricing, three cards, three links", () => {
  it("TIER_META carries the three owner-locked Stripe links", () => {
    expect(TIER_META.starter.stripeLink).toBe("https://buy.stripe.com/eVq5kC7qQ0909zV0sJ5os00");
    expect(TIER_META.growth.stripeLink).toBe("https://buy.stripe.com/fZubJ0h1qbRI5jFcbr5os01");
    expect(TIER_META.scale.stripeLink).toBe("https://buy.stripe.com/fZu28qfXmaNEdQb2AR5os02");
  });

  it("TIER_META matches the locked monthly prices with the Enterprise public label", () => {
    expect(TIER_META.starter.name).toBe("Starter");
    expect(TIER_META.starter.price).toBe("$199/mo");
    expect(TIER_META.growth.name).toBe("Growth");
    expect(TIER_META.growth.price).toBe("$599/mo");
    expect(TIER_META.scale.name).toBe("Enterprise");
    expect(TIER_META.scale.price).toBe("$1,499/mo");
  });

  it("the workflows library no longer labels the Enterprise tier 'Scale'", () => {
    const libSrc = readFileSync("src/lazy/workflows.index.page.tsx", "utf8");
    expect(libSrc).not.toContain("High Complexity (Scale)");
    expect(libSrc).toContain("High Complexity (Enterprise)");
  });

  it("the workflow detail page resolves via the shared resolver (no per-workflow link drift)", () => {
    const pageSrc = readFileSync("src/components/WorkflowPage.tsx", "utf8");
    expect(pageSrc).toContain("resolveWorkflowTier");
    expect(pageSrc).toContain("currentMeta.stripeLink");
  });
});