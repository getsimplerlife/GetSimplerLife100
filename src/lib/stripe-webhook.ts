import { createHmac, timingSafeEqual } from "crypto";

/**
 * stripe-webhook.ts — pure helpers for the /api/stripe/webhook handler in
 * prod-server.ts (kept dependency-free so they can be unit-tested).
 *
 * Two responsibilities:
 *  1. Plan detection — resolve a legacy tier purchase from its canonical
 *     Stripe payment link (see PLANS_BY_LINK).
 *  2. Signature verification — optional Stripe webhook signature checking
 *     (t=<ts>,v1=<sig> HMAC-SHA256 over `${ts}.${rawBody}`). Enabled only
 *     when STRIPE_WEBHOOK_SECRET is set; fail-closed (reject 400) on missing
 *     or invalid signatures.
 *
 * RETIRED (owner 10-21, removed 10-30): the CRM/ERP "Connection Pack" SKUs
 * and their link-detection helpers (CRM_PACK_LINK / ERP_PACK_LINK /
 * PACKS_BY_LINK / detectPackType / buildPackPurchase). Neither pack payment
 * link exists in the live Stripe account (verified 10-30: exactly three
 * payment links, the platform tiers), so the mapping could never fire
 * truthfully. A checkout that used to look like a pack now records through
 * the generic purchase branch like any other unknown product.
 */

/**
 * Plan purchases (owner 09-27 locked platform pricing; remapped 10-30).
 *
 * These are the THREE LIVE tier payment links — the only buy links on the
 * standard Stripe account (re-verified live 2026-10-30: exactly three payment
 * links, Starter / Growth / Enterprise). A customer who buys today therefore
 * resolves to a real plan record carrying its tier and product name, instead
 * of falling through to the generic branch with no tier.
 *
 * The retired per-employee links (3cI8wR88 / 5kQ6oJbl / aFa7sN60) do NOT exist
 * in the live account; they no longer map to anything (fail-closed) so nothing
 * can be recorded as a plan that was never sold.
 *
 * Detection is fail-closed: unknown links are NOT plans.
 */
export const STARTER_PLAN_LINK = "https://buy.stripe.com/eVq5kC7qQ0909zV0sJ5os00";
export const GROWTH_PLAN_LINK = "https://buy.stripe.com/fZubJ0h1qbRI5jFcbr5os01";
export const ENTERPRISE_PLAN_LINK = "https://buy.stripe.com/fZu28qfXmaNEdQb2AR5os02";

export type PlanTier = "starter" | "growth" | "enterprise";

export interface PlanSpec {
  tier: PlanTier;
  productName: string;
}

/** Canonical spec per tier (the product name recorded on the purchase). */
export const PLAN_SPECS: Record<PlanTier, PlanSpec> = {
  starter: { tier: "starter", productName: "Starter Plan" },
  growth: { tier: "growth", productName: "Growth Plan" },
  enterprise: { tier: "enterprise", productName: "Enterprise Plan" },
};

/** Constant map: canonical plan link → plan spec (tier + product name). */
export const PLANS_BY_LINK: Record<string, PlanSpec> = {
  [STARTER_PLAN_LINK]: PLAN_SPECS.starter,
  [GROWTH_PLAN_LINK]: PLAN_SPECS.growth,
  [ENTERPRISE_PLAN_LINK]: PLAN_SPECS.enterprise,
};

/**
 * Detect a plan purchase from the canonical Stripe payment links. Fail closed:
 * only the three canonical plan links (exact or with Stripe query params)
 * resolve to a plan — any other link returns null and falls through to the
 * generic branch.
 */
export function detectPlanType(paymentLink: string | undefined | null): PlanSpec | null {
  const link = paymentLink || "";
  if (!link) return null;
  for (const [canonical, spec] of Object.entries(PLANS_BY_LINK)) {
    if (link === canonical || link.includes(canonical)) return spec;
  }
  return null;
}

/**
 * Secondary signal: each live payment link carries `metadata.tier`
 * (starter / growth / enterprise), which Stripe copies onto the checkout
 * session. Fail-closed — an unrecognised or missing tier resolves to null, so
 * this can never invent a plan the customer did not buy. It is used only as a
 * fallback behind the link mapping, never instead of it.
 */
export function detectPlanTierFromMetadata(tier: string | undefined | null): PlanSpec | null {
  const key = String(tier || "").trim().toLowerCase();
  if (!key) return null;
  const spec = (PLAN_SPECS as Record<string, PlanSpec | undefined>)[key];
  return spec || null;
}

/** Link first (authoritative), then `metadata.tier`. Null when neither matches. */
export function resolvePlanSpec(
  paymentLink: string | undefined | null,
  metadataTier?: string | undefined | null,
): PlanSpec | null {
  return detectPlanType(paymentLink) || detectPlanTierFromMetadata(metadataTier);
}

/**
 * Build the persisted plan purchase record.
 *
 * Cleanup (10-30): the record carries NO per-agent fields. The per-plan agent
 * grant list (`agentIds`, produced by the retired `planAgentIds()`) and its
 * `agentCount` input are gone with the per-agent model (owner ban on
 * per-agent gating); the field is DROPPED, not written empty. The
 * plan-included Connection Pack slot (`packSlot`) is gone too — that SKU is
 * retired (owner 10-21) and nothing can redeem it.
 */
export function buildPlanPurchase(
  spec: PlanSpec,
  amount: number,
  stripeSessionId: string | undefined | null,
): Record<string, unknown> {
  return {
    id: "purchase-" + Math.random().toString(36).substr(2, 9),
    type: "plan",
    tier: spec.tier,
    productName: spec.productName,
    amount,
    stripeSessionId: stripeSessionId || "unknown",
    status: "active",
    purchasedAt: new Date().toISOString(),
  };
}

/** Max age of a valid Stripe signature timestamp (Stripe recommends 5 min). */
export const STRIPE_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export interface SignatureCheck {
  ok: boolean;
  error?: string;
}

/**
 * Verify a Stripe webhook signature: header `t=<ts>,v1=<sig>` against
 * HMAC-SHA256(`${ts}.${rawBody}`) with the webhook secret, compared in
 * constant time. Returns ok:false (never throws) on any invalid input.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): SignatureCheck {
  if (!signatureHeader) return { ok: false, error: "Missing Stripe signature header" };
  const parts = new Map<string, string>();
  for (const pair of signatureHeader.split(",")) {
    const idx = pair.indexOf("=");
    if (idx > 0) parts.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) return { ok: false, error: "Invalid Stripe signature header" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, error: "Invalid Stripe signature timestamp" };
  const ageMs = Math.abs(Date.now() - ts * 1000);
  if (ageMs > STRIPE_SIGNATURE_TOLERANCE_MS) return { ok: false, error: "Stale Stripe signature" };
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  const match = a.length === b.length && timingSafeEqual(a, b);
  return match ? { ok: true } : { ok: false, error: "Stripe signature mismatch" };
}
