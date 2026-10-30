/**
 * after-purchase.ts — the view model behind /after-purchase (slice 138).
 *
 * Before this slice /after-purchase was a static "what happens after you buy"
 * timeline: every buyer who finished checkout landed on marketing copy and no
 * way in. It is now the doorway: it says what just happened and gives two
 * concrete actions (check your email for the sign-in link / sign in).
 *
 * The honesty rule is the whole point of this module. We only claim a payment
 * was received when the server CONFIRMED it — our own webhook-written sales
 * ledger, or a live Stripe lookup that says the session is paid. No session id
 * (someone followed the footer link, or landed here cold) means no claim at all:
 * the page renders the generic-but-honest "here's how to get in" state.
 *
 * Pure and dependency-free so both the page and the tests share one source of
 * truth for the three states.
 */

export type AfterPurchaseState = "purchased" | "confirming" | "visitor";

/** What /api/purchase/status reports (never includes the buyer's email). */
export interface AfterPurchaseStatus {
  found: boolean;
  verified?: boolean;
  source?: string;
  productName?: string | null;
  amountCents?: number;
  reason?: string;
  /** Whether the buyer's confirmation email actually went out (true) or not. */
  emailSent?: boolean;
}

export interface AfterPurchaseAction {
  label: string;
  href: string;
  primary: boolean;
}

export interface AfterPurchaseViewModel {
  state: AfterPurchaseState;
  badge: string;
  heading: string;
  lead: string;
  /** Title of the action card — never a success claim in the visitor state. */
  actionTitle: string;
  /** Receipt lines — only populated when a purchase was actually confirmed. */
  receipt: { label: string; value: string }[];
  actions: AfterPurchaseAction[];
  notes: string[];
}

const SIGN_IN: AfterPurchaseAction = { label: "Sign in", href: "/login", primary: true };
const SET_PASSWORD: AfterPurchaseAction = {
  label: "Set or reset your password",
  href: "/set-password",
  primary: false,
};

/** $599.00 — Stripe amounts are integer cents. */
export function formatUsd(amountCents: number | undefined | null): string {
  const cents = Math.max(0, Math.round(Number(amountCents) || 0));
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Derive the page state.
 *
 * - no session id            → "visitor": honest generic doorway, no payment claim.
 * - session id, confirmed    → "purchased": real tier + amount, two actions.
 * - session id, unconfirmed  → "confirming": says we have not recorded it yet;
 *                              never implies success.
 */
export function afterPurchaseView(input: {
  sessionId?: string | null;
  status?: AfterPurchaseStatus | null;
  checking?: boolean;
}): AfterPurchaseViewModel {
  const sessionId = String(input.sessionId || "").trim();
  const status = input.status || null;

  if (!sessionId) {
    return {
      state: "visitor",
      badge: "After you buy",
      heading: "Bought a plan? Your way in is your inbox.",
      actionTitle: "How you get in",
      lead:
        "As soon as your payment clears we email a confirmation to the address you used at checkout — " +
        "that email carries your set-password link. Use it to choose a password, then sign in to your portal.",
      receipt: [],
      actions: [SIGN_IN, SET_PASSWORD, { label: "See plans and pricing", href: "/pricing", primary: false }],
      notes: [
        "Already have an account? Sign in with your existing password.",
        "Not a customer yet? The plans and what each one includes are on the pricing page.",
      ],
    };
  }

  if (status && status.found) {
    const plan = String(status.productName || "").trim();
    const receipt: { label: string; value: string }[] = [];
    if (plan) receipt.push({ label: "Plan", value: plan });
    if (typeof status.amountCents === "number") {
      receipt.push({ label: "Amount paid", value: formatUsd(status.amountCents) });
    }
    return {
      state: "purchased",
      badge: "Payment received",
      heading: plan ? `${plan} is on your account.` : "Your purchase is on your account.",
      actionTitle: "Check your email for your sign-in link",
      lead:
        status.emailSent === false
          ? "Your purchase is recorded. We could not confirm your confirmation email went out yet, so don't wait on it — " +
            "use the password button below with the email you paid with and you're in."
          : "Check your email for your sign-in link — it goes to the address you used at checkout. " +
            "It opens our set-password page so you can choose a password, then sign in.",
      receipt,
      actions: [SIGN_IN, SET_PASSWORD],
      notes: [
        "Confirmation emails sometimes land in spam or promotions — check there first.",
        "Nothing in your inbox after a few minutes? Use the password link above with the email you paid with.",
      ],
    };
  }

  // Session id present but not confirmed by us yet (webhook lag, or a lookup we
  // could not complete). Say exactly that — never "your payment succeeded".
  return {
    state: "confirming",
    badge: "One more step",
    heading: input.checking ? "Checking your purchase…" : "We're confirming your payment.",
    actionTitle: "Check your email for your sign-in link",
    lead: input.checking
      ? "Hold on a moment while we check this checkout session."
      : "If your checkout completed, your confirmation email is on its way to the address you paid with — " +
        "it carries your sign-in link. Nothing in your inbox in a few minutes? Use the password link below " +
        "with the email you paid with.",
    receipt: [],
    actions: [SIGN_IN, SET_PASSWORD],
    notes: ["We only show a receipt here once the payment is confirmed on our side."],
  };
}
