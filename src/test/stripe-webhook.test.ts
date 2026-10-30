import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import {
  verifyStripeSignature,
  detectPlanType,
  buildPlanPurchase,
  STRIPE_SIGNATURE_TOLERANCE_MS,
} from "../lib/stripe-webhook";

/**
 * Unit tests for the Stripe webhook helpers (signature + plan mapping).
 *
 * The CRM/ERP Connection Pack helpers (detectPackType / buildPackPurchase and
 * their link constants) were REMOVED in the 10-30 retired-product cleanup:
 * neither pack payment link exists in the live Stripe account, so the mapping
 * could never fire truthfully. `src/test/retired-product-cleanup.test.ts` pins
 * their absence.
 */

function sign(rawBody: string, secret: string, timestampSec?: number): string {
  const ts = timestampSec ?? Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

describe("detectPlanType — legacy tier links still map, unknown links fail closed", () => {
  it("maps each of the three legacy tier links to its tier", () => {
    expect(detectPlanType("https://buy.stripe.com/3cI8wR88Tasfc1B9XW2Fa2K")?.tier).toBe("starter");
    expect(detectPlanType("https://buy.stripe.com/5kQ6oJbl5dErc1B1rq2Fa2L")?.tier).toBe("professional");
    expect(detectPlanType("https://buy.stripe.com/aFa7sN60LdErc1B5HG2Fa2M")?.tier).toBe("enterprise");
  });
  it("matches with Stripe query params and rejects anything else", () => {
    expect(detectPlanType("https://buy.stripe.com/3cI8wR88Tasfc1B9XW2Fa2K?session_id=cs_1")?.tier).toBe("starter");
    // The retired pack links are NOT plans and never were.
    expect(detectPlanType("https://buy.stripe.com/5kQaEZ60LcAn8Ppgmk2Fa2I")).toBeNull();
    expect(detectPlanType("https://buy.stripe.com/eVq5kC7qQ0909zV0sJ5os00")).toBeNull();
    expect(detectPlanType("")).toBeNull();
    expect(detectPlanType(undefined)).toBeNull();
    expect(detectPlanType(null)).toBeNull();
  });
});

describe("buildPlanPurchase — plan record shape (no per-agent fields)", () => {
  it("records the plan tier and product with NO agent grant fields", () => {
    const rec = buildPlanPurchase(
      { tier: "starter", productName: "Starter Plan" },
      750000,
      "cs_plan_1",
    ) as any;
    expect(rec.type).toBe("plan");
    expect(rec.tier).toBe("starter");
    expect(rec.productName).toBe("Starter Plan");
    expect(rec.amount).toBe(750000);
    expect(rec.stripeSessionId).toBe("cs_plan_1");
    expect(rec.status).toBe("active");
    expect(rec.purchasedAt).toBeTruthy();
    // Cleanup 10-30: per-agent gating is banned — the fields are DROPPED.
    expect(rec.agentIds).toBeUndefined();
    expect(rec.agentCount).toBeUndefined();
    // The retired Connection Pack slot is not granted either.
    expect(rec.packSlot).toBeUndefined();
  });

  it("defaults a missing session id to 'unknown'", () => {
    const rec = buildPlanPurchase({ tier: "enterprise", productName: "Enterprise Plan" }, 149900, null) as any;
    expect(rec.stripeSessionId).toBe("unknown");
  });
});

describe("verifyStripeSignature — optional signature verification (fail closed)", () => {
  const SECRET = "whsec_test_secret";
  const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_1" } } });

  it("accepts a valid signature", () => {
    const check = verifyStripeSignature(body, sign(body, SECRET), SECRET);
    expect(check.ok).toBe(true);
    expect(check.error).toBeUndefined();
  });

  it("rejects a missing signature header", () => {
    const check = verifyStripeSignature(body, null, SECRET);
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/missing/i);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const check = verifyStripeSignature(body, sign(body, "wrong_secret"), SECRET);
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/mismatch/i);
  });

  it("rejects a tampered body", () => {
    const tampered = body.replace("cs_1", "cs_EVIL");
    const check = verifyStripeSignature(tampered, sign(body, SECRET), SECRET);
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/mismatch/i);
  });

  it("rejects a stale signature (outside the 5-minute tolerance)", () => {
    const stale = Math.floor(Date.now() / 1000) - (STRIPE_SIGNATURE_TOLERANCE_MS / 1000 + 60);
    const check = verifyStripeSignature(body, sign(body, SECRET, stale), SECRET);
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/stale/i);
  });

  it("rejects a malformed header (no t= / v1= parts)", () => {
    expect(verifyStripeSignature(body, "garbage", SECRET).ok).toBe(false);
    expect(verifyStripeSignature(body, "t=12345", SECRET).ok).toBe(false);
    expect(verifyStripeSignature(body, "v1=abcdef", SECRET).ok).toBe(false);
  });

  it("rejects a non-numeric timestamp", () => {
    const check = verifyStripeSignature(body, "t=notanumber,v1=abc", SECRET);
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/timestamp/i);
  });
});



