import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createHmac } from "crypto";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";
import {
  applySubscriptionEvent,
  accessForStatus,
  lifecycleEventKey,
  normalizeSubscriptionStatus,
  resolveTenantForEvent,
  summarizeSubscriptions,
  type LifecycleStore,
} from "../lib/subscription-lifecycle";

/**
 * SLICE 139 — subscription lifecycle.
 *
 * Two layers, on purpose:
 *  1. UNIT — the pure state machine (resolution + apply). This is where the
 *     correctness requirement lives: an event must resolve to exactly ONE
 *     existing tenant or change nothing at all.
 *  2. E2E — the REAL webhook route on the self-hosted server (:3999), proving
 *     the same behaviour through signature verification, the durable stores
 *     and the audit trail.
 *
 * The gap this closes: until now the webhook handled only
 * checkout.session.completed, so a cancelled customer read "Active" forever
 * and a dead card changed nothing.
 */

/* ─────────────────────────────── unit layer ─────────────────────────────── */

const TENANT_A = "lifecycle-a@example.test";
const TENANT_B = "lifecycle-b@example.test";

function planRow(overrides: Record<string, any> = {}) {
  return {
    id: "purchase-abc123",
    type: "plan",
    tier: "growth",
    productName: "Growth Plan",
    amount: 59900,
    stripeSessionId: "cs_test_1",
    stripeCustomerId: "cus_A",
    stripeSubscriptionId: "sub_A",
    status: "active",
    purchasedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseStore(): LifecycleStore {
  return {
    purchases: {
      [TENANT_A]: [planRow()],
      [TENANT_B]: [
        planRow({
          id: "purchase-def456",
          tier: "starter",
          productName: "Starter Plan",
          amount: 19900,
          stripeSessionId: "cs_test_2",
          stripeCustomerId: "cus_B",
          stripeSubscriptionId: "sub_B",
        }),
      ],
    },
    subscriptions: {},
  };
}

const AT = "2026-10-30T12:00:00.000Z";

describe("resolution — an event must identify exactly one EXISTING tenant", () => {
  it("resolves by the subscription id we recorded at checkout", () => {
    const r = resolveTenantForEvent(baseStore().purchases, { subscriptionId: "sub_A", customerId: "cus_A" });
    expect(r).toEqual({ tenantEmail: TENANT_A, via: "subscription_id" });
  });

  it("falls back to the customer id when the row has no subscription id", () => {
    const purchases = { [TENANT_A]: [planRow({ stripeSubscriptionId: undefined })] };
    const r = resolveTenantForEvent(purchases, { subscriptionId: "sub_unknown", customerId: "cus_A" });
    expect(r).toEqual({ tenantEmail: TENANT_A, via: "customer_id" });
  });

  it("refuses to guess when one id matches two tenants", () => {
    const purchases = {
      [TENANT_A]: [planRow()],
      [TENANT_B]: [planRow({ id: "purchase-dup", stripeSubscriptionId: "sub_A" })],
    };
    const r = resolveTenantForEvent(purchases, { subscriptionId: "sub_A" });
    expect(r.tenantEmail).toBeNull();
    expect(r.reason).toBe("ambiguous_subscription_id");
  });

  it("accepts an email the event states ONLY for a known tenant with no conflicting ids", () => {
    const purchases = { [TENANT_A]: [planRow({ stripeSubscriptionId: undefined, stripeCustomerId: undefined })] };
    // Known tenant, no ids on the row → the stated email is the only signal.
    expect(resolveTenantForEvent(purchases, { subscriptionId: "sub_new", emails: [{ email: TENANT_A, via: "invoice_email" }] }))
      .toEqual({ tenantEmail: TENANT_A, via: "invoice_email" });
    // The row belongs to a DIFFERENT subscription → the email is not proof.
    const conflicting = resolveTenantForEvent(baseStore().purchases, {
      subscriptionId: "sub_other",
      emails: [{ email: TENANT_A, via: "invoice_email" }],
    });
    expect(conflicting.tenantEmail).toBeNull();
    expect(conflicting.reason).toBe("no_matching_tenant");
  });

  it("never invents a tenant from an email that has no purchase record", () => {
    const r = resolveTenantForEvent(baseStore().purchases, { emails: [{ email: "stranger@example.test", via: "invoice_email" }] });
    expect(r.tenantEmail).toBeNull();
  });
});

describe("cancellation — the right tenant goes inactive, nobody else moves", () => {
  it("marks ONLY the cancelled tenant's subscription inactive/revoked", () => {
    const store = baseStore();
    const out = applySubscriptionEvent({
      store,
      type: "customer.subscription.deleted",
      eventId: "evt_cancel_1",
      object: { id: "sub_A", object: "subscription", customer: "cus_A", status: "canceled" },
      at: AT,
    });

    expect(out.applied).toBe(true);
    expect(out.outcome).toBe("applied");
    expect(out.tenantEmail).toBe(TENANT_A);
    expect(out.via).toBe("subscription_id");
    expect(out.state?.status).toBe("canceled");
    expect(out.state?.access).toBe("revoked");
    expect(out.state?.canceledAt).toBe(AT);

    // The purchase row the portal reads no longer says "active".
    const rowA = out.store.purchases[TENANT_A][0];
    expect(rowA.status).toBe("canceled");
    expect(rowA.subscriptionAccess).toBe("revoked");

    // The other tenant is untouched — not even a state record invented.
    expect(out.store.purchases[TENANT_B][0].status).toBe("active");
    expect(out.store.subscriptions[TENANT_B]).toBeUndefined();
  });

  it("treats customer.subscription.updated → canceled/unpaid as a revocation, past_due as at-risk", () => {
    const cancel = applySubscriptionEvent({
      store: baseStore(),
      type: "customer.subscription.updated",
      eventId: "evt_upd_cancel",
      object: { id: "sub_A", object: "subscription", customer: "cus_A", status: "canceled" },
      at: AT,
    });
    expect(cancel.state?.access).toBe("revoked");

    const unpaid = applySubscriptionEvent({
      store: baseStore(),
      type: "customer.subscription.updated",
      eventId: "evt_upd_unpaid",
      object: { id: "sub_A", object: "subscription", customer: "cus_A", status: "unpaid" },
      at: AT,
    });
    expect(unpaid.state?.status).toBe("unpaid");
    expect(unpaid.state?.access).toBe("revoked");
    expect(unpaid.store.purchases[TENANT_A][0].status).toBe("unpaid");

    const pastDue = applySubscriptionEvent({
      store: baseStore(),
      type: "customer.subscription.updated",
      eventId: "evt_upd_pastdue",
      object: { id: "sub_A", object: "subscription", customer: "cus_A", status: "past_due" },
      at: AT,
    });
    expect(pastDue.state?.status).toBe("past_due");
    expect(pastDue.state?.access).toBe("at_risk");
    // Grace: the entitlement flag stays "active" so access is NOT cut off.
    expect(pastDue.store.purchases[TENANT_A][0].status).toBe("active");
  });

  it("ignores a subscription status it does not act on, without touching state", () => {
    const store = baseStore();
    const out = applySubscriptionEvent({
      store,
      type: "customer.subscription.updated",
      eventId: "evt_upd_paused",
      object: { id: "sub_A", object: "subscription", customer: "cus_A", status: "paused" },
      at: AT,
    });
    expect(out.applied).toBe(false);
    expect(out.outcome).toBe("ignored");
    expect(out.reason).toBe("unsupported_subscription_status");
    // Deep-equal, not same-reference: the pure module hands back a defensive
    // copy, and what this test is actually asserting is that NOTHING CHANGED.
    expect(out.store).toEqual(store);
  });
});

describe("failed payment — dunning recorded, access NOT revoked", () => {
  it("records the failure (since + Stripe's attempt_count) and keeps access", () => {
    const out = applySubscriptionEvent({
      store: baseStore(),
      type: "invoice.payment_failed",
      eventId: "evt_fail_1",
      object: {
        id: "in_1",
        object: "invoice",
        customer: "cus_A",
        subscription: "sub_A",
        customer_email: TENANT_A,
        attempt_count: 2,
        amount_due: 59900,
      },
      at: AT,
    });

    expect(out.applied).toBe(true);
    expect(out.tenantEmail).toBe(TENANT_A);
    expect(out.state?.status).toBe("past_due");
    expect(out.state?.access).toBe("at_risk");
    expect(out.state?.dunning).toMatchObject({ active: true, since: AT, attemptCount: 2, lastInvoiceId: "in_1" });

    // NOT revoked: the entitlement flag the gates read stays "active".
    const row = out.store.purchases[TENANT_A][0];
    expect(row.status).toBe("active");
    expect(row.subscriptionStatus).toBe("past_due");
    expect(row.dunning).toMatchObject({ active: true, attemptCount: 2 });

    // And the other tenant is untouched.
    expect(out.store.purchases[TENANT_B][0].status).toBe("active");
  });

  it("keeps the ORIGINAL failure date on later attempts (since does not slide)", () => {
    const first = applySubscriptionEvent({
      store: baseStore(),
      type: "invoice.payment_failed",
      eventId: "evt_fail_1",
      object: { id: "in_1", customer: "cus_A", subscription: "sub_A", attempt_count: 1 },
      at: "2026-10-28T00:00:00.000Z",
    });
    const second = applySubscriptionEvent({
      store: first.store,
      type: "invoice.payment_failed",
      eventId: "evt_fail_2",
      object: { id: "in_1", customer: "cus_A", subscription: "sub_A", attempt_count: 2 },
      at: "2026-10-30T00:00:00.000Z",
    });
    expect(second.state?.dunning?.since).toBe("2026-10-28T00:00:00.000Z");
    expect(second.state?.dunning?.attemptCount).toBe(2);
  });
});

describe("recovery — a later invoice.paid clears dunning automatically", () => {
  it("clears the dunning state and restores access", () => {
    const failed = applySubscriptionEvent({
      store: baseStore(),
      type: "invoice.payment_failed",
      eventId: "evt_fail_1",
      object: { id: "in_1", customer: "cus_A", subscription: "sub_A", attempt_count: 3 },
      at: AT,
    });
    expect(failed.state?.dunning?.active).toBe(true);

    const paid = applySubscriptionEvent({
      store: failed.store,
      type: "invoice.paid",
      eventId: "evt_paid_1",
      object: { id: "in_1", customer: "cus_A", subscription: "sub_A", amount_paid: 59900 },
      at: "2026-10-31T00:00:00.000Z",
    });

    expect(paid.applied).toBe(true);
    expect(paid.tenantEmail).toBe(TENANT_A);
    expect(paid.state?.status).toBe("active");
    expect(paid.state?.access).toBe("active");
    expect(paid.state?.dunning?.active).toBe(false);
    expect(paid.state?.dunning?.clearedAt).toBe("2026-10-31T00:00:00.000Z");
    expect(paid.state?.lastPaidAt).toBe("2026-10-31T00:00:00.000Z");
    expect(paid.state?.lastPaidAmountCents).toBe(59900);

    const row = paid.store.purchases[TENANT_A][0];
    expect(row.status).toBe("active");
    expect(row.subscriptionStatus).toBe("active");
    expect(row.dunning.active).toBe(false);
  });

  it("recovers a tenant marked unpaid, but never resurrects a cancelled one", () => {
    const unpaid = applySubscriptionEvent({
      store: baseStore(),
      type: "customer.subscription.updated",
      eventId: "evt_upd_unpaid",
      object: { id: "sub_A", customer: "cus_A", status: "unpaid" },
      at: AT,
    });
    expect(unpaid.state?.access).toBe("revoked");

    const recovered = applySubscriptionEvent({
      store: unpaid.store,
      type: "invoice.paid",
      eventId: "evt_paid_recover",
      object: { id: "in_9", customer: "cus_A", subscription: "sub_A", amount_paid: 59900 },
      at: "2026-11-01T00:00:00.000Z",
    });
    expect(recovered.state?.status).toBe("active");
    expect(recovered.state?.access).toBe("active");

    const cancelled = applySubscriptionEvent({
      store: baseStore(),
      type: "customer.subscription.deleted",
      eventId: "evt_cancel_1",
      object: { id: "sub_A", customer: "cus_A", status: "canceled" },
      at: AT,
    });
    const finalInvoice = applySubscriptionEvent({
      store: cancelled.store,
      type: "invoice.paid",
      eventId: "evt_paid_after_cancel",
      object: { id: "in_final", customer: "cus_A", subscription: "sub_A", amount_paid: 19900 },
      at: "2026-11-02T00:00:00.000Z",
    });
    expect(finalInvoice.applied).toBe(false);
    expect(finalInvoice.outcome).toBe("ignored");
    expect(finalInvoice.reason).toBe("canceled_subscription_not_reactivated");
    expect(finalInvoice.store.subscriptions[TENANT_A].status).toBe("canceled");
    expect(finalInvoice.store.subscriptions[TENANT_A].access).toBe("revoked");
  });
});

describe("unresolvable events — change nothing, and are audited", () => {
  it("leaves the store byte-identical and records the unresolved event", () => {
    const store = baseStore();
    const before = JSON.stringify(store);
    const out = applySubscriptionEvent({
      store,
      type: "customer.subscription.deleted",
      eventId: "evt_unknown_1",
      object: { id: "sub_ZZZ", object: "subscription", customer: "cus_ZZZ", status: "canceled" },
      at: AT,
    });

    expect(out.applied).toBe(false);
    expect(out.outcome).toBe("unresolved");
    expect(out.reason).toBe("no_matching_tenant");
    expect(out.tenantEmail).toBeNull();
    expect(out.store).toEqual(store); // deep-equal: nothing changed
    expect(JSON.stringify(out.store)).toBe(before);

    // The audit entry exists and names what could not be resolved.
    expect(out.audit.outcome).toBe("unresolved");
    expect(out.audit.eventId).toBe("evt_unknown_1");
    expect(out.audit.stripeSubscriptionId).toBe("sub_ZZZ");
    expect(out.audit.stripeCustomerId).toBe("cus_ZZZ");
    expect(out.audit.tenantEmail).toBeNull();
  });

  it("does not create a tenant record for an email it has never seen", () => {
    const store = baseStore();
    const out = applySubscriptionEvent({
      store,
      type: "invoice.payment_failed",
      eventId: "evt_stranger",
      object: { id: "in_x", customer: "cus_X", customer_email: "nobody@example.test", attempt_count: 1 },
      at: AT,
    });
    expect(out.applied).toBe(false);
    expect(Object.keys(out.store.purchases)).toEqual([TENANT_A, TENANT_B]);
    expect(out.store.subscriptions).toEqual({});
  });
});

describe("idempotency key + helpers", () => {
  it("keys on the Stripe event id, and on state when there is none", () => {
    expect(lifecycleEventKey({ type: "invoice.paid", eventId: "evt_1", objectId: "in_1" })).toBe("evt_1");
    const k1 = lifecycleEventKey({ type: "invoice.paid", eventId: null, objectId: "in_1", signature: "paid=59900" });
    const k2 = lifecycleEventKey({ type: "invoice.paid", eventId: null, objectId: "in_1", signature: "paid=59900" });
    const k3 = lifecycleEventKey({ type: "invoice.paid", eventId: null, objectId: "in_1", signature: "paid=19900" });
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });

  it("maps Stripe statuses onto access honestly", () => {
    expect(normalizeSubscriptionStatus("trialing")).toBe("active");
    expect(normalizeSubscriptionStatus("past_due")).toBe("past_due");
    expect(normalizeSubscriptionStatus("incomplete")).toBeNull();
    expect(accessForStatus("active")).toBe("active");
    expect(accessForStatus("past_due")).toBe("at_risk");
    expect(accessForStatus("canceled")).toBe("revoked");
    expect(accessForStatus("unpaid")).toBe("revoked");
  });

  it("summarises per-tenant state for the operator view", () => {
    const out = applySubscriptionEvent({
      store: baseStore(),
      type: "invoice.payment_failed",
      eventId: "evt_fail_sum",
      object: { id: "in_1", customer: "cus_A", subscription: "sub_A", attempt_count: 1 },
      at: AT,
    });
    const rows = summarizeSubscriptions(out.store);
    const a = rows.find((r) => r.tenantEmail === TENANT_A)!;
    const b = rows.find((r) => r.tenantEmail === TENANT_B)!;
    expect(a.status).toBe("past_due");
    expect(a.access).toBe("at_risk");
    expect(a.planName).toBe("Growth Plan");
    expect(a.dunning?.active).toBe(true);
    expect(b.status).toBe("active");
    expect(b.access).toBe("active");
  });
});

/* ──────────────────────────────── e2e layer ─────────────────────────────── */

const PURCHASES_FILE = join(testDataDir(), "tenant_purchases.json");
const SUBSCRIPTIONS_FILE = join(testDataDir(), "tenant_subscriptions.json");
const EVENTS_FILE = join(testDataDir(), "subscription_events.json");
const BASE_URL = testBaseUrl();

const E2E_EMAIL = "e2e-lifecycle@" + Date.now() + ".test";
const E2E_OTHER = "e2e-lifecycle-other@" + Date.now() + ".test";
const E2E_CUSTOMER = "cus_e2e_" + Date.now();
const E2E_SUBSCRIPTION = "sub_e2e_" + Date.now();

function resolveWebhookSecret(): string | undefined {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf-8");
    const m = raw.match(/^STRIPE_WEBHOOK_SECRET=(.*)$/m);
    if (m) return m[1].trim();
  } catch { /* no .env in worktree */ }
  return undefined;
}

const WEBHOOK_SECRET = resolveWebhookSecret();
let serverEnforcesSignatures = false;

function stripeSignatureHeader(rawBody: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", WEBHOOK_SECRET!).update(`${ts}.${rawBody}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

async function postEvent(body: unknown): Promise<{ status: number; json: any }> {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (serverEnforcesSignatures) headers["stripe-signature"] = stripeSignatureHeader(rawBody);
  const res = await fetch(`${BASE_URL}/api/stripe/webhook`, { method: "POST", headers, body: rawBody });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
}

function rowsFor(email: string): any[] {
  const all = readJSONFile(PURCHASES_FILE);
  return Array.isArray(all[email]) ? all[email] : [];
}

describe("E2E — the real /api/stripe/webhook route applies subscription lifecycle", () => {
  beforeAll(async () => {
    await ensureTestServer();
    const dir = join(PURCHASES_FILE, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // Probe signature enforcement exactly like the purchase suite does.
    try {
      const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "e2e-probe" }),
      });
      serverEnforcesSignatures = res.status === 400;
    } catch { serverEnforcesSignatures = false; }
    if (serverEnforcesSignatures && !WEBHOOK_SECRET) {
      throw new Error("Server enforces Stripe signatures but STRIPE_WEBHOOK_SECRET is not available to sign test POSTs.");
    }

    // Seed a real purchase through the REAL checkout event, carrying the
    // customer + subscription ids Stripe sends — this is what makes every
    // later lifecycle event resolvable.
    const { status } = await postEvent({
      id: "evt_e2e_checkout_" + Date.now(),
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_e2e_lifecycle_" + Date.now(),
          object: "checkout.session",
          customer_details: { email: E2E_EMAIL },
          customer_email: E2E_EMAIL,
          customer: E2E_CUSTOMER,
          subscription: E2E_SUBSCRIPTION,
          payment_link: "https://buy.stripe.com/fZubJ0h1qbRI5jFcbr5os01",
          amount_total: 59900,
          metadata: { tier: "growth" },
        },
      },
    });
    expect(status).toBe(200);
  });

  afterAll(() => {
    // Leave the shared test data dir tidy — remove only OUR rows.
    for (const file of [PURCHASES_FILE, SUBSCRIPTIONS_FILE]) {
      const all = readJSONFile(file);
      if (all[E2E_EMAIL]) { delete all[E2E_EMAIL]; writeFileSync(file, JSON.stringify(all, null, 2)); }
      if (all[E2E_OTHER]) { delete all[E2E_OTHER]; writeFileSync(file, JSON.stringify(all, null, 2)); }
    }
  });

  it("stamps the Stripe customer + subscription ids on the purchase row", () => {
    const rows = rowsFor(E2E_EMAIL);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const plan = rows.find((r) => r.type === "plan")!;
    expect(plan).toBeTruthy();
    expect(plan.tier).toBe("growth");
    expect(plan.stripeCustomerId).toBe(E2E_CUSTOMER);
    expect(plan.stripeSubscriptionId).toBe(E2E_SUBSCRIPTION);
  });

  it("a failed payment records dunning and does NOT revoke access", async () => {
    const { status, json } = await postEvent({
      id: "evt_e2e_fail_" + Date.now(),
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_e2e_1",
          object: "invoice",
          customer: E2E_CUSTOMER,
          subscription: E2E_SUBSCRIPTION,
          customer_email: E2E_EMAIL,
          attempt_count: 1,
          amount_due: 59900,
        },
      },
    });
    expect(status).toBe(200);
    expect(json.outcome).toBe("applied");

    const state = readJSONFile(SUBSCRIPTIONS_FILE)[E2E_EMAIL];
    expect(state.status).toBe("past_due");
    expect(state.access).toBe("at_risk");
    expect(state.dunning.active).toBe(true);
    expect(state.dunning.attemptCount).toBe(1);

    // The entitlement flag stays "active" — grace, not a cut-off.
    const plan = rowsFor(E2E_EMAIL).find((r) => r.type === "plan")!;
    expect(plan.status).toBe("active");
    expect(plan.subscriptionStatus).toBe("past_due");
  });

  it("a re-delivered event applies exactly once", async () => {
    const eventId = "evt_e2e_dup_" + Date.now();
    const body = {
      id: eventId,
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_e2e_dup",
          object: "invoice",
          customer: E2E_CUSTOMER,
          subscription: E2E_SUBSCRIPTION,
          attempt_count: 2,
        },
      },
    };
    const first = await postEvent(body);
    expect(first.status).toBe(200);
    expect(first.json.outcome).toBe("applied");

    const second = await postEvent(body);
    expect(second.status).toBe(200);
    expect(second.json.outcome).toBe("duplicate");

    const state = readJSONFile(SUBSCRIPTIONS_FILE)[E2E_EMAIL];
    // Applied once: the attempt count is still the one the event carried.
    expect(state.dunning.attemptCount).toBe(2);

    // And exactly ONE audit entry exists for that event id.
    const events = readJSONFile(EVENTS_FILE);
    const matching = Object.values(events).filter((e: any) => e && e.eventId === eventId);
    expect(matching.length).toBe(1);
  });

  it("a later invoice.paid clears the dunning state", async () => {
    const { status, json } = await postEvent({
      id: "evt_e2e_paid_" + Date.now(),
      type: "invoice.paid",
      data: {
        object: {
          id: "in_e2e_1",
          object: "invoice",
          customer: E2E_CUSTOMER,
          subscription: E2E_SUBSCRIPTION,
          amount_paid: 59900,
        },
      },
    });
    expect(status).toBe(200);
    expect(json.outcome).toBe("applied");

    const state = readJSONFile(SUBSCRIPTIONS_FILE)[E2E_EMAIL];
    expect(state.status).toBe("active");
    expect(state.access).toBe("active");
    expect(state.dunning.active).toBe(false);
    expect(state.lastPaidAmountCents).toBe(59900);
  });

  it("an unresolvable event changes nothing and is audited", async () => {
    const before = JSON.stringify(readJSONFile(SUBSCRIPTIONS_FILE));
    const eventId = "evt_e2e_unresolved_" + Date.now();
    const { status, json } = await postEvent({
      id: eventId,
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_e2e_ghost", object: "subscription", customer: "cus_e2e_ghost", status: "canceled" } },
    });

    // 200 so Stripe stops retrying an event that will never resolve.
    expect(status).toBe(200);
    expect(json.outcome).toBe("unresolved");

    // Nothing changed on disk…
    expect(JSON.stringify(readJSONFile(SUBSCRIPTIONS_FILE))).toBe(before);
    // …and no tenant record was invented.
    expect(readJSONFile(SUBSCRIPTIONS_FILE)["cus_e2e_ghost"]).toBeUndefined();

    // …but the event IS in the audit trail for an operator to see.
    const events = readJSONFile(EVENTS_FILE);
    const entry: any = Object.values(events).find((e: any) => e && e.eventId === eventId);
    expect(entry).toBeTruthy();
    expect(entry.outcome).toBe("unresolved");
    expect(entry.tenantEmail).toBeNull();
    expect(entry.stripeSubscriptionId).toBe("sub_e2e_ghost");
  });

  it("a cancellation marks the right tenant inactive and leaves others alone", async () => {
    // A second tenant, so "the right tenant" is a real assertion.
    await postEvent({
      id: "evt_e2e_checkout2_" + Date.now(),
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_e2e_lifecycle2_" + Date.now(),
          object: "checkout.session",
          customer_details: { email: E2E_OTHER },
          customer_email: E2E_OTHER,
          customer: E2E_CUSTOMER + "_other",
          subscription: E2E_SUBSCRIPTION + "_other",
          payment_link: "https://buy.stripe.com/eVq5kC7qQ0909zV0sJ5os00",
          amount_total: 19900,
          metadata: { tier: "starter" },
        },
      },
    });

    const { status, json } = await postEvent({
      id: "evt_e2e_cancel_" + Date.now(),
      type: "customer.subscription.deleted",
      data: { object: { id: E2E_SUBSCRIPTION, object: "subscription", customer: E2E_CUSTOMER, status: "canceled" } },
    });
    expect(status).toBe(200);
    expect(json.outcome).toBe("applied");

    const state = readJSONFile(SUBSCRIPTIONS_FILE)[E2E_EMAIL];
    expect(state.status).toBe("canceled");
    expect(state.access).toBe("revoked");

    const plan = rowsFor(E2E_EMAIL).find((r) => r.type === "plan")!;
    expect(plan.status).toBe("canceled");

    // The other tenant is still active.
    const otherRows = rowsFor(E2E_OTHER);
    expect(otherRows.length).toBeGreaterThanOrEqual(1);
    expect(otherRows[0].status).toBe("active");
    expect(readJSONFile(SUBSCRIPTIONS_FILE)[E2E_OTHER]).toBeUndefined();
  });

  it("still rejects an unsigned lifecycle payload when signatures are enforced", async (ctx) => {
    if (!serverEnforcesSignatures) { ctx.skip(); return; }
    const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "evt_e2e_unsigned_" + Date.now(),
        type: "invoice.paid",
        data: { object: { id: "in_unsigned", customer: E2E_CUSTOMER, subscription: E2E_SUBSCRIPTION } },
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("Source-level: the webhook wires the lifecycle handlers", () => {
  it("dispatches all four subscription events through the shared pure module", () => {
    const src = readFileSync(join(process.cwd(), "prod-server.ts"), "utf-8");
    // The branch exists on the real webhook path.
    expect(src).toContain("isSubscriptionEventType(eventType)");
    expect(src).toContain("applyStripeLifecycleEvent(");
    // The state machine lives in the shared, unit-tested module.
    expect(src).toContain('from "./src/lib/subscription-lifecycle"');
    // Durable state + audit trail are real files, not in-memory only.
    expect(src).toContain('"tenant_subscriptions.json"');
    expect(src).toContain('"subscription_events.json"');
    // The checkout path must stamp the ids lifecycle events are keyed by.
    expect(src).toContain("planPurchase.stripeSubscriptionId = sessionSubscriptionId");
    // The operator surface reads the same state.
    expect(src).toContain('subPath === "subscriptions"');
  });

  it("the four handled event types are exactly the ones the brief scoped", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/subscription-lifecycle.ts"), "utf-8");
    for (const t of [
      "customer.subscription.deleted",
      "customer.subscription.updated",
      "invoice.payment_failed",
      "invoice.paid",
    ]) {
      expect(src).toContain(t);
    }
    // Out of scope by decision: no plan-change handling anywhere in the module.
    expect(src).not.toContain("updateSubscription");
    expect(src).not.toContain("plan_change");
  });
});
