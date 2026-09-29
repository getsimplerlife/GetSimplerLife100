import { automationLibrary } from "./automation-library";

/**
 * LOCKED PLATFORM TIERS (owner 09-27) — one platform, every capability in every
 * tier. Tiers differ only by scale limits, governance, and support. These are
 * the ONLY payment links offered for platform subscriptions; do not add or
 * re-map them without the owner.
 *
 * Single source of truth for how BOTH workflow surfaces (the /workflows library
 * index and the /workflows/$id detail page) label a workflow's tier. The two
 * datasets use different id schemes (library: "man-…" prefixes; detail: plain
 * slugs), so the detail page resolves by workflow NAME against the library's
 * difficulty → tier mapping, falling back to its own stored priceTier.
 */
export type TierKey = "starter" | "growth" | "scale";

export const TIER_META: Record<
  TierKey,
  {
    name: string;
    price: string;
    stripeLink: string;
    badgeClass: string;
  }
> = {
  starter: {
    name: "Starter",
    price: "$199/mo",
    stripeLink: "https://buy.stripe.com/eVq5kC7qQ0909zV0sJ5os00",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/10",
  },
  growth: {
    name: "Growth",
    price: "$599/mo",
    stripeLink: "https://buy.stripe.com/fZubJ0h1qbRI5jFcbr5os01",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/10",
  },
  scale: {
    name: "Enterprise",
    price: "$1,499/mo",
    stripeLink: "https://buy.stripe.com/fZu28qfXmaNEdQb2AR5os02",
    badgeClass: "bg-rose-500/10 text-rose-400 border-rose-500/10",
  },
};

/** Library difficulty → locked tier. "hard" is the Enterprise tier (see TIER_META). */
export function tierFromDifficulty(difficulty: string): TierKey {
  if (difficulty === "easy") return "starter";
  if (difficulty === "medium") return "growth";
  return "scale";
}

// Library tier by workflow name — built once from the automation library.
const libraryTierByName = new Map<string, TierKey>(
  automationLibrary.map((card) => [card.name, tierFromDifficulty(card.difficulty)])
);

/**
 * Resolve the tier a workflow should display. Prefers the library's difficulty
 * mapping for the same-named workflow (so /workflows and /workflows/$id never
 * disagree); falls back to the detail dataset's own priceTier.
 */
export function resolveWorkflowTier(workflowName: string, fallback: TierKey): TierKey {
  return libraryTierByName.get(workflowName) ?? fallback;
}