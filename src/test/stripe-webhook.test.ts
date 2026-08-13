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
  agentPaymentLink,
  matchAgentByPaymentLink,
  matchAgentByMetadata,
  STARTER_PLAN_LINK,
  PROFESSIONAL_PLAN_LINK,
  ENTERPRISE_PLAN_LINK,
  detectPlanType,
  planAgentIds,
  buildPlanPurchase,
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

describe("agentPaymentLink — runtime catalog payment-link field", () => {
  const AGENT_LINK = "https://buy.stripe.com/dRm3cx60Lbwj7Lleec2Fa29";

  it("reads the runtime `paymentLink` field (ai_employees.json seed shape)", () => {
    // Regression: the runtime catalog stores the link as `paymentLink`, NOT
    // `stripePaymentLink` — the webhook matcher must read this spelling or
    // every per-agent purchase falls to the generic branch (no agentId).
    expect(agentPaymentLink({ id: "invoice-processor-v1", paymentLink: AGENT_LINK })).toBe(AGENT_LINK);
  });

  it("falls back to the legacy `stripePaymentLink` spelling", () => {
    expect(agentPaymentLink({ id: "x", stripePaymentLink: AGENT_LINK })).toBe(AGENT_LINK);
  });

  it("prefers paymentLink when both exist", () => {
    expect(agentPaymentLink({ paymentLink: AGENT_LINK, stripePaymentLink: "https://buy.stripe.com/OTHER" })).toBe(AGENT_LINK);
  });

  it("returns undefined for missing/blank links", () => {
    expect(agentPaymentLink({})).toBeUndefined();
    expect(agentPaymentLink({ paymentLink: "" })).toBeUndefined();
    expect(agentPaymentLink({ paymentLink: "   " })).toBeUndefined();
    expect(agentPaymentLink(null)).toBeUndefined();
  });
});

describe("matchAgentByPaymentLink — webhook agent entitlement mapping", () => {
  const CATALOG = [
    { id: "invoice-processor-v1", name: "Invoice Processor", paymentLink: "https://buy.stripe.com/dRm3cx60Lbwj7Lleec2Fa29" },
    { id: "crm-sync-agent-v1", name: "CRM Sync Agent", paymentLink: "https://buy.stripe.com/5kQ5kFexhcAn5Ddgmk2Fa2j" },
    { id: "legacy-agent-v1", name: "Legacy Agent", stripePaymentLink: "https://buy.stripe.com/6oUbJ3cp9dErghRc642Fa24" },
  ];

  it("matches the exact session payment_link to the runtime paymentLink", () => {
    const hit = matchAgentByPaymentLink(CATALOG, "https://buy.stripe.com/dRm3cx60Lbwj7Lleec2Fa29");
    expect(hit?.id).toBe("invoice-processor-v1");
  });

  it("matches when Stripe appends query params to the payment link", () => {
    const hit = matchAgentByPaymentLink(CATALOG, "https://buy.stripe.com/5kQ5kFexhcAn5Ddgmk2Fa2j?prefilled_email=a%40b.com");
    expect(hit?.id).toBe("crm-sync-agent-v1");
  });

  it("matches the legacy stripePaymentLink spelling", () => {
    const hit = matchAgentByPaymentLink(CATALOG, "https://buy.stripe.com/6oUbJ3cp9dErghRc642Fa24");
    expect(hit?.id).toBe("legacy-agent-v1");
  });

  it("returns null for unknown payment links (fail closed — no guessing)", () => {
    expect(matchAgentByPaymentLink(CATALOG, "https://buy.stripe.com/3cI8wR88Tasfc1B9XW2Fa2K")).toBeNull();
    expect(matchAgentByPaymentLink(CATALOG, "https://buy.stripe.com/nonexistent")).toBeNull();
  });

  it("returns null for empty catalog / missing session link", () => {
    expect(matchAgentByPaymentLink([], "https://buy.stripe.com/x")).toBeNull();
    expect(matchAgentByPaymentLink(CATALOG, null)).toBeNull();
    expect(matchAgentByPaymentLink(CATALOG, undefined)).toBeNull();
    expect(matchAgentByPaymentLink(undefined, "https://buy.stripe.com/x")).toBeNull();
  });

  it("never matches a pack link (packs are handled by detectPackType first)", () => {
    expect(matchAgentByPaymentLink(CATALOG, CRM_PACK_LINK)).toBeNull();
    expect(matchAgentByPaymentLink(CATALOG, ERP_PACK_LINK)).toBeNull();
  });
});

describe("matchAgentByMetadata — legacy stripePriceId metadata path", () => {
  const CATALOG = [
    { id: "invoice-processor-v1", stripePriceId: "price_abc123" },
    { id: "plain-agent", paymentLink: "https://buy.stripe.com/x" },
  ];

  it("matches the employee whose stripePriceId equals metadata.priceId", () => {
    const hit = matchAgentByMetadata(CATALOG, { priceId: "price_abc123" });
    expect(hit?.id).toBe("invoice-processor-v1");
  });

  it("returns null when no employee has the priceId", () => {
    expect(matchAgentByMetadata(CATALOG, { priceId: "price_zzz" })).toBeNull();
    expect(matchAgentByMetadata(CATALOG, {})).toBeNull();
    expect(matchAgentByMetadata(CATALOG, null)).toBeNull();
  });
});

describe("detectPlanType — canonical plan links (owner decision F3: Starter 3 / Professional 8 / Enterprise 17)", () => {
  it("maps the canonical Starter link to starter with 3 agents", () => {
    expect(detectPlanType(STARTER_PLAN_LINK)?.tier).toBe("starter");
    expect(detectPlanType(STARTER_PLAN_LINK)?.agentCount).toBe(3);
  });

  it("maps the canonical Professional link to professional with 8 agents", () => {
    expect(detectPlanType(PROFESSIONAL_PLAN_LINK)?.tier).toBe("professional");
    expect(detectPlanType(PROFESSIONAL_PLAN_LINK)?.agentCount).toBe(8);
  });

  it("maps the canonical Enterprise link to enterprise with all 17 agents", () => {
    expect(detectPlanType(ENTERPRISE_PLAN_LINK)?.tier).toBe("enterprise");
    expect(detectPlanType(ENTERPRISE_PLAN_LINK)?.agentCount).toBe(17);
  });

  it("matches canonical links with Stripe query params appended", () => {
    expect(detectPlanType(STARTER_PLAN_LINK + "?prefilled_email=a%40b.com")?.tier).toBe("starter");
  });

  it("returns null for non-plan links (packs, agents, generic, junk)", () => {
    expect(detectPlanType(CRM_PACK_LINK)).toBeNull();
    expect(detectPlanType(ERP_PACK_LINK)).toBeNull();
    expect(detectPlanType("https://buy.stripe.com/dRm3cx60Lbwj7Lleec2Fa29")).toBeNull(); // agent link
    expect(detectPlanType("https://buy.stripe.com/4gMfZj88TfMz6Hh8TS2Fa1K")).toBeNull(); // generic
    expect(detectPlanType("")).toBeNull();
    expect(detectPlanType(null)).toBeNull();
    expect(detectPlanType("https://buy.stripe.com/test_starter_plan")).toBeNull(); // fail closed — no substring guessing
  });
});

describe("planAgentIds — which catalog agents a tier grants", () => {
  const CATALOG = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10",
    "a11", "a12", "a13", "a14", "a15", "a16", "a17"].map((id) => ({ id, name: id }));

  it("Starter grants the first 3 agents in catalog order", () => {
    const spec = detectPlanType(STARTER_PLAN_LINK)!;
    expect(planAgentIds(CATALOG, spec)).toEqual(["a1", "a2", "a3"]);
  });

  it("Professional grants the first 8 agents in catalog order", () => {
    const spec = detectPlanType(PROFESSIONAL_PLAN_LINK)!;
    expect(planAgentIds(CATALOG, spec)).toHaveLength(8);
    expect(planAgentIds(CATALOG, spec)[0]).toBe("a1");
    expect(planAgentIds(CATALOG, spec)[7]).toBe("a8");
  });

  it("Enterprise grants all 17 agents", () => {
    const spec = detectPlanType(ENTERPRISE_PLAN_LINK)!;
    expect(planAgentIds(CATALOG, spec)).toHaveLength(17);
  });

  it("caps at the catalog size when the catalog is smaller than the tier", () => {
    const spec = detectPlanType(ENTERPRISE_PLAN_LINK)!;
    const small = [{ id: "x1" }, { id: "x2" }];
    expect(planAgentIds(small, spec)).toEqual(["x1", "x2"]);
  });

  it("returns [] for an empty/invalid catalog or spec", () => {
    expect(planAgentIds([], detectPlanType(STARTER_PLAN_LINK)!)).toEqual([]);
    expect(planAgentIds(CATALOG, null)).toEqual([]);
    expect(planAgentIds(undefined, detectPlanType(STARTER_PLAN_LINK)!)).toEqual([]);
  });
});

describe("buildPlanPurchase — plan record shape (type + tier + agentIds)", () => {
  it("records a Starter plan with tier, agentCount and the granted agentIds", () => {
    const rec = buildPlanPurchase(
      { tier: "starter", productName: "Starter Plan", agentCount: 3 },
      750000,
      "cs_test_plan_1",
      ["invoice-processor-v1", "crm-sync-agent-v1", "email-assistant-v1"],
    ) as any;
    expect(rec.type).toBe("plan");
    expect(rec.tier).toBe("starter");
    expect(rec.productName).toBe("Starter Plan");
    expect(rec.agentCount).toBe(3);
    expect(rec.agentIds).toHaveLength(3);
    expect(rec.agentIds[0]).toBe("invoice-processor-v1");
    expect(rec.amount).toBe(750000);
    expect(rec.stripeSessionId).toBe("cs_test_plan_1");
    expect(rec.status).toBe("active");
    expect(rec.purchasedAt).toBeTruthy();
  });
});
