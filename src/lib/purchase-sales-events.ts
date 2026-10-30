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
  opportunityType: string; // "plan" | "other" (pack/agent types retired)
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

/* ─────────────────────────── BUYER CONFIRMATION (slice 138) ──────────────
 * Until this slice the purchase path notified ONLY the owner: a buyer paid,
 * got Stripe's own receipt, and heard nothing from us. These helpers build the
 * buyer's confirmation email and the link into the EXISTING set-password flow.
 *
 * The set-password link deliberately carries NO token. The established flow
 * (src/lib/password-reset.ts + /api/request-password-reset + /api/set-password)
 * proves ownership by emailing a single-use 6-digit code with a 10-minute TTL,
 * then accepting the new password only after that code verifies. A second
 * token scheme would be a second thing to get wrong, so the link only opens
 * that page with the buyer's billing address prefilled. It grants nothing by
 * itself: anyone who has the URL still needs the emailed code.
 */

/**
 * Canonical public origin used for links we email when neither a deployment
 * override (PUBLIC_SITE_URL) nor the request origin is available.
 */
export const DEFAULT_SITE_ORIGIN = "https://simplerlife100.cto.site";

/**
 * Normalize a base URL to a bare origin. Returns null (fail-closed) for
 * anything that is not a usable http(s) origin — a bad base must never be
 * pasted into an email as a link.
 */
export function normalizeSiteOrigin(raw?: string | null): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The buyer's way in: the existing /set-password page with the billing email
 * prefilled. Not a credential (see the note above) — the page still emails a
 * one-time code before it will change a password.
 */
export function setPasswordLink(email: string, origin?: string | null): string {
  const base = normalizeSiteOrigin(origin) || DEFAULT_SITE_ORIGIN;
  const addr = String(email || "").trim().toLowerCase();
  return `${base}/set-password?email=${encodeURIComponent(addr)}`;
}

/** Where a buyer signs in once their password is set. */
export function signInLink(origin?: string | null): string {
  const base = normalizeSiteOrigin(origin) || DEFAULT_SITE_ORIGIN;
  return `${base}/login`;
}

/** Subject line for the buyer's own confirmation email. */
export function buyerConfirmationSubject(productName: string): string {
  const name = String(productName || "").trim() || "your purchase";
  return `Your ${name} — set your password and sign in`;
}

/**
 * Compose the buyer-facing confirmation email body.
 *
 * Truthful copy only: what they bought, what was paid, and how to get in.
 * Nothing here promises onboarding calls, timelines, or capabilities — those
 * are not ours to claim in an automated email.
 *
 * Returns null (fail-closed) when the purchase cannot be described honestly:
 * no product name, no usable set-password link, or no recipient.
 */
export function buyerConfirmationEmailBody(input: {
  productName: string;
  amountCents: number;
  customerEmail: string;
  setPasswordUrl: string;
  signInUrl?: string;
}): string | null {
  const email = String(input.customerEmail || "").trim().toLowerCase();
  const productName = String(input.productName || "").trim();
  const setPasswordUrl = String(input.setPasswordUrl || "").trim();
  if (!email || !productName || !setPasswordUrl) return null;
  const signIn = String(input.signInUrl || "").trim();
  return (
    `Hi,\n\n` +
    `We received your payment — thank you. Here is what you bought.\n\n` +
    `Plan: ${productName}\n` +
    `Amount paid: ${"$" + formatAmountCents(input.amountCents)}\n` +
    `Billing email: ${email}\n\n` +
    `Getting in: your account is tied to the email address above. Set your password here:\n` +
    `${setPasswordUrl}\n\n` +
    `That page emails you a one-time 6-digit code (it expires in 10 minutes) and then lets you choose a password.\n` +
    (signIn ? `Once your password is set, sign in at: ${signIn}\n\n` : `\n`) +
    `If you were not expecting this, reply to this email and we will look into it.\n\n` +
    `— Simpler Life 100\n`
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
