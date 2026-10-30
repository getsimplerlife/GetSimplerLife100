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
 * Plan purchases (owner decision 2026-08-13, task F3). These are the LEGACY
 * per-employee tier links, kept only so historical checkout sessions still map
 * to a plan record (no such link exists in the live Stripe account any more —
 * the live tiers are the three platform links on the pricing page).
 * Detection is fail-closed: unknown links are NOT plans.
 */
export const STARTER_PLAN_LINK = "https://buy.stripe.com/3cI8wR88Tasfc1B9XW2Fa2K";
export const PROFESSIONAL_PLAN_LINK = "https://buy.stripe.com/5kQ6oJbl5dErc1B1rq2Fa2L";
export const ENTERPRISE_PLAN_LINK = "https://buy.stripe.com/aFa7sN60LdErc1B5HG2Fa2M";

export type PlanTier = "starter" | "professional" | "enterprise";

export interface PlanSpec {
  tier: PlanTier;
  productName: string;
}

/** Constant map: canonical plan link → plan spec (tier + product name). */
export const PLANS_BY_LINK: Record<string, PlanSpec> = {
  [STARTER_PLAN_LINK]: { tier: "starter", productName: "Starter Plan" },
  [PROFESSIONAL_PLAN_LINK]: { tier: "professional", productName: "Professional Plan" },
  [ENTERPRISE_PLAN_LINK]: { tier: "enterprise", productName: "Enterprise Plan" },
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
