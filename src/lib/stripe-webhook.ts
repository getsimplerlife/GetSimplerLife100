import { createHmac, timingSafeEqual } from "crypto";

/**
 * stripe-webhook.ts — pure helpers for the /api/stripe/webhook handler in
 * prod-server.ts (kept dependency-free so they can be unit-tested).
 *
 * Two responsibilities:
 *  1. Pack detection — recognize CRM/ERP Connection Pack purchases from the
 *     canonical Stripe payment links the marketplace buy buttons point at.
 *     Those links are opaque IDs with no metadata, so the previous
 *     substring/metadata-only detection never fired and pack purchases fell
 *     through to the generic purchase branch (no type, no slots, no
 *     agentType → the portal marketplace never showed the pack as owned and
 *     the 5-slot entitlement was never recorded).
 *  2. Signature verification — optional Stripe webhook signature checking
 *     (t=<ts>,v1=<sig> HMAC-SHA256 over `${ts}.${rawBody}`). Enabled only
 *     when STRIPE_WEBHOOK_SECRET is set; fail-closed (reject 400) on missing
 *     or invalid signatures.
 */

/** Canonical Stripe payment links for the Connection Packs (marketplace buy buttons). */
export const CRM_PACK_LINK = "https://buy.stripe.com/5kQaEZ60LcAn8Ppgmk2Fa2I";
export const ERP_PACK_LINK = "https://buy.stripe.com/dRmeVf88TfMzghRda82Fa2J";

/** Slots granted per pack purchase (also drives the /api/data/{crm,erp}-slots API). */
export const PACK_SLOTS = 5;

export type PackType = "crm-pack" | "erp-pack";

export interface PackSpec {
  type: PackType;
  slots: number;
  productName: string;
}

/** Constant map: canonical pack link → pack spec (type + slots + productName). */
export const PACKS_BY_LINK: Record<string, PackSpec> = {
  [CRM_PACK_LINK]: { type: "crm-pack", slots: PACK_SLOTS, productName: "CRM Connection Pack" },
  [ERP_PACK_LINK]: { type: "erp-pack", slots: PACK_SLOTS, productName: "ERP Connection Pack" },
};

/**
 * Detect whether a Stripe checkout session is a CRM/ERP Connection Pack.
 * Checks the canonical pack links first (exact or prefix), then falls back
 * to the legacy substring forms and metadata.productType so existing test
 * and metadata-based flows keep working.
 */
export function detectPackType(
  paymentLink: string | undefined | null,
  metadata?: Record<string, unknown> | undefined | null,
): PackSpec | null {
  const link = paymentLink || "";
  for (const [canonical, spec] of Object.entries(PACKS_BY_LINK)) {
    if (link === canonical || link.includes(canonical)) return spec;
  }
  // Legacy fallbacks (kept from the original handler).
  if (link.includes("crm_pack") || link.includes("crm-pack") || metadata?.productType === "crm-pack") {
    return { type: "crm-pack", slots: PACK_SLOTS, productName: "CRM Connection Pack" };
  }
  if (
    link.includes("erp_pack") || link.includes("erp-pack") || link.includes("crm_erp_pack") ||
    metadata?.productType === "erp-pack"
  ) {
    return { type: "erp-pack", slots: PACK_SLOTS, productName: "ERP Connection Pack" };
  }
  return null;
}

/**
 * Build the persisted pack purchase record. `agentType` mirrors `type` so the
 * portal marketplace (which matches employees by `agentType`) shows the pack
 * as owned after the webhook provisions it.
 */
export function buildPackPurchase(
  spec: PackSpec,
  amount: number,
  stripeSessionId: string | undefined | null,
): Record<string, unknown> {
  return {
    id: "purchase-" + Math.random().toString(36).substr(2, 9),
    type: spec.type,
    productName: spec.productName,
    slots: spec.slots,
    usedSlots: 0,
    agentType: spec.type,
    amount,
    stripeSessionId: stripeSessionId || "unknown",
    status: "active",
    purchasedAt: new Date().toISOString(),
  };
}

/**
 * The payment-link field an AI-employee record carries. The runtime catalog
 * (ai_employees.json, seeded from src/data/agents.ts) stores it as
 * `paymentLink`; some older/other catalogs used `stripePaymentLink`. The
 * webhook must match BOTH spellings or every per-agent purchase falls through
 * to the generic branch (no agentId) and the paid agent is never granted
 * (live bug found 2026-08-13: runtime records had only `paymentLink`, so the
 * `e.stripePaymentLink` matcher never fired and per-agent buyers got nothing).
 */
export function agentPaymentLink(employee: any): string | undefined {
  const link = employee?.paymentLink || employee?.stripePaymentLink;
  return typeof link === "string" && link.trim() ? link.trim() : undefined;
}

/**
 * Find the AI-employee whose payment link matches a Stripe checkout session's
 * `payment_link`. Match rules (fail closed — never guess):
 *   1. exact equality; or
 *   2. the session link is a SUPERSET of the catalog link (e.g. Stripe appends
 *      query params like ?prefilled_email=…); or
 *   3. the catalog link is a superset of the session link (legacy behavior —
 *      `e.stripePaymentLink.includes(session.payment_link)` from the original
 *      handler).
 * Returns the matched employee or null. Multiple candidates never happen
 * (each agent has its own link); if they did, the first match wins.
 */
export function matchAgentByPaymentLink(
  employees: any[] | undefined | null,
  sessionPaymentLink: string | undefined | null,
): any | null {
  if (!Array.isArray(employees) || !sessionPaymentLink) return null;
  const link = sessionPaymentLink.trim();
  if (!link) return null;
  for (const e of employees) {
    const eLink = agentPaymentLink(e);
    if (!eLink) continue;
    if (eLink === link || link.includes(eLink) || eLink.includes(link)) return e;
  }
  return null;
}

/**
 * Find an AI-employee by Stripe metadata priceId (legacy path: some flows
 * create Checkout Sessions with metadata.priceId == the employee's
 * stripePriceId instead of using a Payment Link).
 */
export function matchAgentByMetadata(
  employees: any[] | undefined | null,
  metadata: Record<string, unknown> | undefined | null,
): any | null {
  if (!Array.isArray(employees) || !metadata?.priceId) return null;
  const priceId = String(metadata.priceId);
  for (const e of employees) {
    if (e?.stripePriceId && String(e.stripePriceId) === priceId) return e;
  }
  return null;
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
