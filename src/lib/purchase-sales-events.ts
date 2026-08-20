/**
 * purchase-sales-events.ts — shared "on purchase completed" handler (pure,
 * dependency-free so it can be unit-tested). Called exactly once per real,
 * verified Stripe purchase (checkout.session.completed). It:
 *
 *   (a) builds a durable, structured owner sale-notification event for
 *       electric.vortexz@gmail.com so the owner is told a purchase happened
 *       (product/service, amount, customer email) — the established gap was
 *       that purchases did NOT email the owner while forms + assessments do;
 *   (b) provisions / upgrades the purchasing customer's portal ISR account
 *       (users.json keyed by email) using their purchase email — create the
 *       account if missing (seeded to the purchased entitlements, NO password
 *       — the customer sets one via the existing /api/set-password flow), or
 *       upgrade/update the entitlements if an account already exists. Never
 *       duplicate, never overwrite an existing password/login, never touch
 *       rows that aren't the purchaser's (data-isolation + non-destruction).
 *
 * Fail-closed: a missing/empty purchase email yields NO owner event and NO
 * account provisioning (we never invent a notification or an account for a
 * non-verified purchase). Everything here is idempotent w.r.t. Stripe at-least-
 * once delivery — the caller already dedupes on session id before invoking.
 */

export interface OwnerSaleEvent {
  kind: "purchase";
  productName: string;
  amountCents: number;
  customerEmail: string;
  opportunityType: string; // "plan" | "crm-pack" | "erp-pack" | "agent" | "other"
  provisioned: "created" | "upgraded" | "none"; // account outcome
  at: string;
}

/** Round a value back up to cents (Stripe amount_total is already integer cents). */
export function formatAmountCents(amountCents: number): string {
  const cents = Math.max(0, Math.round(Number(amountCents) || 0));
  return (cents / 100).toFixed(2);
}

/**
 * Build the durable owner sale event for a real purchase. Returns null
 * (fail-closed) when there is no customer email (we can't notify/attribute)
 * or no product name.
 */
export function buildOwnerSaleEvent(input: {
  productName: string;
  opportunityType: string;
  amountCents: number;
  customerEmail: string;
  provisioned: "created" | "upgraded" | "none";
}): OwnerSaleEvent | null {
  const email = String(input.customerEmail || "").trim().toLowerCase();
  const productName = String(input.productName || "").trim();
  if (!email || !productName) return null;
  return {
    kind: "purchase",
    productName,
    amountCents: Math.max(0, Math.round(Number(input.amountCents) || 0)),
    customerEmail: email,
    opportunityType: input.opportunityType || "other",
    provisioned: input.provisioned || "none",
    at: new Date().toISOString(),
  };
}

/** Compose the owner-facing email body for a sale (product, amount, buyer). */
export function ownerSaleEmailBody(event: OwnerSaleEvent): string {
  return (
    `New purchase — ${event.productName}\n\n` +
    `Product/service: ${event.productName}\n` +
    `Type: ${event.opportunityType}\n` +
    `Amount: $${formatAmountCents(event.amountCents)}\n` +
    `Customer email: ${event.customerEmail}\n` +
    `Account: ${event.provisioned === "created" ? "provisioned (new)" : event.provisioned === "upgraded" ? "upgraded (existing)" : "no account change"}\n` +
    `Time: ${event.at}\n`
  );
}

export interface ProvisionResult {
  users: Record<string, any>; // users.json keyed by email (unchanged object unless modified)
  outcome: "created" | "upgraded" | "none";
}

/**
 * Provision or upgrade the purchasing customer's portal account by their
 * purchase email. `users` is the users.json object (email -> user record).
 *
 * - No email            → outcome "none" (fail-closed, no account invented).
 * - Account absent      → add a minimal record: { email, createdAt, role:"user",
 *   source:"purchase", provisionedAt }, with NO password (customer sets one via
 *   /api/set-password). Existing fields (role/createdAt) are never clobbered.
 * - Account present     → keep the existing password/createdAt/role untouched,
 *   mark source/purchased + record upgrade stamp. Never duplicate, never reset
 *   the login.
 *
 * Returns a NEW users object only when modified; returns the same reference
 * (and outcome "none") when there is nothing to do.
 */
export function provisionAccountForPurchase(
  users: Record<string, any>,
  purchaseEmail: string,
  entitlements?: Record<string, unknown>,
): ProvisionResult {
  const email = String(purchaseEmail || "").trim().toLowerCase();
  if (!email) return { users, outcome: "none" };
  const existing = users && typeof users === "object" ? users[email] : undefined;

  if (existing && typeof existing === "object") {
    // Upgrade in place: never overwrite password/login/role/createdAt.
    const next = { ...existing };
    next.source = "purchase";
    next.purchased = true;
    next.upgradedAt = new Date().toISOString();
    if (entitlements && typeof entitlements === "object") {
      next.entitlements = { ...(next.entitlements || {}), ...entitlements };
    }
    const updated = { ...users, [email]: next };
    return { users: updated, outcome: "upgraded" };
  }

  // Create-if-missing — no password, the customer sets one via set-password.
  const record: any = {
    email,
    role: users?.[email]?.role || "user",
    createdAt: existing?.createdAt || Date.now(),
    source: "purchase",
    purchased: true,
    provisionedAt: new Date().toISOString(),
  };
  if (entitlements && typeof entitlements === "object") {
    record.entitlements = { ...entitlements };
  }
  const updated = { ...(users || {}), [email]: record };
  return { users: updated, outcome: "created" };
}
