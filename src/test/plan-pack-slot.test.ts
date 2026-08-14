import { describe, expect, it } from "vitest";
import {
  choosePlanPackSlot,
  findIncludedPlanPurchase,
  getPlanPackSlot,
  PACK_TYPE_BY_CHOICE,
  PLAN_INCLUDED_PACK_SLOTS,
} from "../lib/plan-pack-slot";

function planPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: "purchase-plan-1",
    type: "plan",
    tier: "starter",
    productName: "Starter Plan",
    agentCount: 3,
    agentIds: ["a1", "a2", "a3"],
    packSlot: { included: true, chosen: null },
    amount: 750000,
    stripeSessionId: "cs_1",
    status: "active",
    purchasedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("findIncludedPlanPurchase — locate the plan purchase with the included pack slot", () => {
  it("finds an active plan with packSlot.included true", () => {
    const p = planPurchase();
    const hit = findIncludedPlanPurchase([{ type: "agent", status: "active" }, p]);
    expect(hit?.id).toBe("purchase-plan-1");
  });
  it("ignores inactive plans, non-plan records, and plans without the slot", () => {
    expect(findIncludedPlanPurchase([planPurchase({ status: "inactive" })])).toBeNull();
    expect(findIncludedPlanPurchase([planPurchase({ packSlot: undefined })])).toBeNull();
    expect(findIncludedPlanPurchase([planPurchase({ packSlot: { included: false, chosen: null } })])).toBeNull();
    expect(findIncludedPlanPurchase([{ type: "crm-pack", status: "active", slots: 5 }])).toBeNull();
    expect(findIncludedPlanPurchase([])).toBeNull();
    expect(findIncludedPlanPurchase(null)).toBeNull();
    expect(findIncludedPlanPurchase(undefined)).toBeNull();
  });
});

describe("getPlanPackSlot — read-only portal view", () => {
  it("returns not-included when there is no plan with a slot", () => {
    expect(getPlanPackSlot([])).toEqual({ included: false, chosen: null });
    expect(getPlanPackSlot([planPurchase({ packSlot: { included: false, chosen: null } })])).toEqual({ included: false, chosen: null });
  });
  it("returns included with null choice before redemption", () => {
    expect(getPlanPackSlot([planPurchase()])).toEqual({ included: true, chosen: null });
  });
  it("reflects the chosen pack after redemption", () => {
    expect(getPlanPackSlot([planPurchase({ packSlot: { included: true, chosen: "crm" } })])).toEqual({ included: true, chosen: "crm" });
    expect(getPlanPackSlot([planPurchase({ packSlot: { included: true, chosen: "erp" } })])).toEqual({ included: true, chosen: "erp" });
  });
  it("normalizes an unknown chosen value to null (fail closed)", () => {
    expect(getPlanPackSlot([planPurchase({ packSlot: { included: true, chosen: "hubspot" } })])).toEqual({ included: true, chosen: null });
  });
});

describe("choosePlanPackSlot — redeem the included Connection Pack slot", () => {
  it("redeems CRM: sets chosen and materializes a crm-pack record with 1 slot", () => {
    const purchases = [planPurchase()];
    const out = choosePlanPackSlot(purchases, "crm");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.slot).toEqual({ included: true, chosen: "crm" });
    const plan = out.purchases.find((p: any) => p.type === "plan");
    expect(plan.packSlot).toEqual({ included: true, chosen: "crm" });
    const pack = out.purchases.find((p: any) => p.type === "crm-pack");
    expect(pack).toBeDefined();
    expect(pack.slots).toBe(PLAN_INCLUDED_PACK_SLOTS);
    expect(pack.usedSlots).toBe(0);
    expect(pack.status).toBe("active");
    expect(pack.source).toBe("plan-included");
    expect(pack.planPurchaseId).toBe("purchase-plan-1");
    expect(pack.agentType).toBe("crm-pack");
    // Original array is not mutated in place (immutability of the input).
    expect(purchases).toHaveLength(1);
  });
  it("redeems ERP: sets chosen and materializes an erp-pack record", () => {
    const out = choosePlanPackSlot([planPurchase()], "erp");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.slot).toEqual({ included: true, chosen: "erp" });
    expect(out.purchases.some((p: any) => p.type === "erp-pack")).toBe(true);
  });
  it("rejects an invalid choice with 400", () => {
    for (const bad of ["crmx", "hubspot", "", 42, null, undefined]) {
      const out = choosePlanPackSlot([planPurchase()], bad);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.status).toBe(400);
    }
  });
  it("rejects when there is no plan with an included slot (404)", () => {
    expect(choosePlanPackSlot([], "crm").ok).toBe(false);
    const out = choosePlanPackSlot([{ type: "agent", status: "active" }], "crm");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.status).toBe(404);
    // A plan without packSlot (pre-decision records) must NOT unlock a slot.
    const legacy = planPurchase({ packSlot: undefined });
    expect(choosePlanPackSlot([legacy], "crm").ok).toBe(false);
  });
  it("rejects a second choice of the OTHER pack with 409 (one-time slot)", () => {
    const purchases = [planPurchase({ packSlot: { included: true, chosen: "crm" } })];
    const out = choosePlanPackSlot(purchases, "erp");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.status).toBe(409);
      expect(out.error).toMatch(/already chosen/i);
    }
  });
  it("is idempotent when re-choosing the SAME pack (no duplicate pack record)", () => {
    const purchases = [planPurchase({ packSlot: { included: true, chosen: "crm" } })];
    const out = choosePlanPackSlot(purchases, "crm");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.purchases.filter((p: any) => p.type === "crm-pack")).toHaveLength(0);
    expect(out.slot).toEqual({ included: true, chosen: "crm" });
  });
  it("maps each choice to the right pack type", () => {
    expect(PACK_TYPE_BY_CHOICE.crm).toBe("crm-pack");
    expect(PACK_TYPE_BY_CHOICE.erp).toBe("erp-pack");
  });
});
