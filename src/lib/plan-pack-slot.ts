/**
 * plan-pack-slot.ts — plan-included Connection Pack slot (owner decision
 * 2026-08-14: "add one CRM or ERP slot to bundle if offered in the bundle").
 *
 * Every plan purchase (Starter $7.5k / Professional $15k / Enterprise $30k)
 * now ALSO includes 1 Connection Pack slot: the tenant chooses CRM Pack or
 * ERP Pack when activating. The entitlement lives on the plan purchase
 * record as `packSlot: { included: true, chosen: null | 'crm' | 'erp' }`
 * (see buildPlanPurchase in src/lib/stripe-webhook.ts).
 *
 * Redeeming the slot ("choosing") materializes a real pack-type record in
 * the tenant's purchases array — exactly how a standalone pack purchase
 * unlocks connectors today — so the existing CRM/ERP slot logic (connect
 * gate, /api/data/{crm,erp}-slots, consumeCrmErpSlot) works unchanged:
 *   { type: "crm-pack"|"erp-pack", slots: 1, usedSlots: 0, status: "active",
 *     source: "plan-included", planPurchaseId: <plan id>, ... }
 *
 * Fail-closed rules (no free stuff, no guessing):
 *   - invalid choice                → 400
 *   - no active plan with slot      → 404
 *   - already chosen a DIFFERENT pack → 409 (one-time choice)
 *   - already chosen the SAME pack  → idempotent OK (200, unchanged)
 * The functions below are pure (they take/return the purchases array); the
 * prod-server endpoint persists the result.
 */

export type PackChoice = "crm" | "erp";
export const PACK_CHOICES: readonly PackChoice[] = ["crm", "erp"];
/** Slots granted when the plan-included pack slot is redeemed (1 slot). */
export const PLAN_INCLUDED_PACK_SLOTS = 1;
export const PACK_TYPE_BY_CHOICE: Record<PackChoice, "crm-pack" | "erp-pack"> = {
  crm: "crm-pack",
  erp: "erp-pack",
};
export const PACK_NAME_BY_CHOICE: Record<PackChoice, string> = {
  crm: "CRM Connection Pack",
  erp: "ERP Connection Pack",
};

export interface PlanPackSlot {
  included: boolean;
  chosen: PackChoice | null;
}

/** Find the tenant's active plan purchase that includes a pack slot. */
export function findIncludedPlanPurchase(userPurchases: any[]): any | null {
  if (!Array.isArray(userPurchases)) return null;
  return (
    userPurchases.find(
      (p: any) => p?.type === "plan" && p?.status === "active" && p?.packSlot?.included === true,
    ) || null
  );
}

/** Read-only view of the included pack slot for the portal. */
export function getPlanPackSlot(userPurchases: any[]): PlanPackSlot {
  const plan = findIncludedPlanPurchase(userPurchases);
  if (!plan) return { included: false, chosen: null };
  const chosen = plan.packSlot?.chosen;
  return { included: true, chosen: PACK_CHOICES.includes(chosen) ? chosen : null };
}

export type ChoosePackResult =
  | { ok: true; purchases: any[]; slot: PlanPackSlot }
  | { ok: false; status: number; error: string };

/**
 * Redeem the plan-included Connection Pack slot. Returns the (possibly
 * modified) purchases array on success; the caller persists it.
 */
export function choosePlanPackSlot(userPurchases: any[], choice: unknown): ChoosePackResult {
  if (choice !== "crm" && choice !== "erp") {
    return { ok: false, status: 400, error: "Invalid pack choice — expected 'crm' or 'erp'" };
  }
  const purchases = Array.isArray(userPurchases) ? userPurchases.map((p) => ({ ...p })) : [];
  const plan = findIncludedPlanPurchase(purchases);
  if (!plan) {
    return { ok: false, status: 404, error: "No active plan with an included Connection Pack slot" };
  }
  const current = plan.packSlot?.chosen;
  if (current && current !== choice) {
    return {
      ok: false,
      status: 409,
      error: `Connection Pack already chosen (${current === "crm" ? "CRM" : "ERP"}) — the included slot is one-time`,
    };
  }
  if (current === choice) {
    // Idempotent re-choose: no double pack record, no change.
    return { ok: true, purchases, slot: { included: true, chosen: choice } };
  }
  // First choice: record it on the plan + materialize a pack-type record so
  // the existing slot gate / slot APIs see an active pack with 1 free slot.
  plan.packSlot = { included: true, chosen: choice };
  const packType = PACK_TYPE_BY_CHOICE[choice];
  purchases.push({
    id: "purchase-" + Math.random().toString(36).substr(2, 9),
    type: packType,
    productName: PACK_NAME_BY_CHOICE[choice],
    slots: PLAN_INCLUDED_PACK_SLOTS,
    usedSlots: 0,
    agentType: packType,
    source: "plan-included",
    planPurchaseId: plan.id,
    status: "active",
    purchasedAt: new Date().toISOString(),
  });
  return { ok: true, purchases, slot: { included: true, chosen: choice } };
}
