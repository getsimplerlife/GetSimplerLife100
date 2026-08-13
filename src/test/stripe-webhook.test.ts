import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import {
  CRM_PACK_LINK,
  ERP_PACK_LINK,
  PACK_SLOTS,
  detectPackType,
  buildPackPurchase,
  verifyStripeSignature,
  STRIPE_SIGNATURE_TOLERANCE_MS,
} from "../lib/stripe-webhook";

function sign(rawBody: string, secret: string, timestampSec?: number): string {
  const ts = timestampSec ?? Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

describe("detectPackType — canonical CRM/ERP Connection Pack links", () => {
  it("maps the canonical CRM pack link to crm-pack with 5 slots", () => {
    const spec = detectPackType(CRM_PACK_LINK, {});
    expect(spec?.type).toBe("crm-pack");
    expect(spec?.slots).toBe(PACK_SLOTS);
    expect(spec?.slots).toBe(5);
    expect(spec?.productName).toBe("CRM Connection Pack");
  });

  it("maps the canonical ERP pack link to erp-pack with 5 slots", () => {
    const spec = detectPackType(ERP_PACK_LINK, {});
    expect(spec?.type).toBe("erp-pack");
    expect(spec?.slots).toBe(5);
    expect(spec?.productName).toBe("ERP Connection Pack");
  });

  it("matches the canonical links even with surrounding characters (includes)", () => {
    expect(detectPackType(CRM_PACK_LINK + "?session_id=abc", {})?.type).toBe("crm-pack");
    expect(detectPackType("https://buy.stripe.com/dRmeVf88TfMzghRda82Fa2J?x=1", {})?.type).toBe("erp-pack");
  });

  it("keeps the legacy substring fallbacks (crm_pack / crm-pack)", () => {
    expect(detectPackType("https://buy.stripe.com/test_crm_pack_5slots", {})?.type).toBe("crm-pack");
    expect(detectPackType("https://buy.stripe.com/test_crm-pack_5slots", {})?.type).toBe("crm-pack");
  });

  it("keeps the legacy substring fallbacks (erp_pack / erp-pack / crm_erp_pack)", () => {
    expect(detectPackType("https://buy.stripe.com/test_erp_pack_5slots", {})?.type).toBe("erp-pack");
    expect(detectPackType("https://buy.stripe.com/test_erp-pack_5slots", {})?.type).toBe("erp-pack");
    expect(detectPackType("https://buy.stripe.com/test_crm_erp_pack", {})?.type).toBe("erp-pack");
  });

  it("keeps the metadata.productType fallback", () => {
    expect(detectPackType("", { productType: "crm-pack" })?.type).toBe("crm-pack");
    expect(detectPackType("", { productType: "erp-pack" })?.type).toBe("erp-pack");
  });

  it("returns null for non-pack links", () => {
    expect(detectPackType("https://buy.stripe.com/3cI8wR88Tasfc1B9XW2Fa2K", {})).toBeNull();
    expect(detectPackType("", {})).toBeNull();
    expect(detectPackType(undefined, undefined)).toBeNull();
    expect(detectPackType(null, null)).toBeNull();
  });
});

describe("buildPackPurchase — pack record shape (type + slots + agentType)", () => {
  it("records a CRM pack with type, slots and agentType for the marketplace", () => {
    const rec = buildPackPurchase(
      { type: "crm-pack", slots: 5, productName: "CRM Connection Pack" },
      200000,
      "cs_test_123",
    ) as any;
    expect(rec.type).toBe("crm-pack");
    expect(rec.slots).toBe(5);
    expect(rec.agentType).toBe("crm-pack"); // marketplace matches employees by agentType
    expect(rec.productName).toBe("CRM Connection Pack");
    expect(rec.status).toBe("active");
    expect(rec.amount).toBe(200000);
    expect(rec.stripeSessionId).toBe("cs_test_123");
    expect(rec.usedSlots).toBe(0);
    expect(rec.purchasedAt).toBeTruthy();
  });

  it("records an ERP pack with type, slots and agentType", () => {
    const rec = buildPackPurchase(
      { type: "erp-pack", slots: 5, productName: "ERP Connection Pack" },
      350000,
      null,
    ) as any;
    expect(rec.type).toBe("erp-pack");
    expect(rec.slots).toBe(5);
    expect(rec.agentType).toBe("erp-pack");
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
