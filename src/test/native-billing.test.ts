import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeBillingAuthed } from "../native/billing/router";

const T1 = "bill-t1@test.local";
const T2 = "bill-t2@test.local";
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "billing-"));
});
afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ }
});

function ledgerPath(): string {
  return join(dir, "tenant_purchases.json");
}
function seedLedger(ledger: Record<string, unknown[]>): void {
  writeFileSync(ledgerPath(), JSON.stringify(ledger));
}
function ledgerBytes(): string {
  try { return readFileSync(ledgerPath(), "utf-8"); } catch { return ""; }
}
function get(userEmail = T1, extra: Record<string, unknown> = {}) {
  return handleNativeBillingAuthed(new Request("http://test.local/api/native/billing"), {
    userEmail,
    dataDir: dir,
    ...extra,
  });
}
async function bodyOf(res: Response) {
  return (await res.json()) as any;
}

describe("native billing (P1-1) — GET-only honest read", () => {
  it("returns the honest empty contract when nothing is on file", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const { ok, billing } = await bodyOf(res);
    expect(ok).toBe(true);
    expect(billing.source).toBe("none");
    expect(billing.subscription).toBeNull();
    expect(billing.invoices).toEqual([]);
    expect(billing.paymentMethod).toBeNull();
  });

  it("rejects non-GET methods with 405 and never writes", async () => {
    const before = ledgerBytes();
    const res = await handleNativeBillingAuthed(
      new Request("http://test.local/api/native/billing", { method: "POST", body: "{}" }),
      { userEmail: T1, dataDir: dir },
    );
    expect(res.status).toBe(405);
    expect(ledgerBytes()).toBe(before);
  });

  it("fails closed on a missing session identity", async () => {
    const res = await get("");
    expect(res.status).toBe(401);
  });

  it("maps the tenant's OWN durable ledger honestly (cents → dollars)", async () => {
    seedLedger({
      [T1]: [
        { id: "p1", type: "plan", tier: "starter", productName: "Starter Plan", amount: 750000, status: "active", purchasedAt: "2026-09-01T00:00:00.000Z" },
        { id: "p2", amount: 69900, status: "paid", purchasedAt: "2026-09-02T00:00:00.000Z", stripeSessionId: "cs_abc" },
      ],
    });
    const { billing } = await bodyOf(await get());
    expect(billing.source).toBe("durable");
    expect(billing.subscription).toEqual({
      planName: "Starter Plan",
      tier: "starter",
      amount: 7500,
      interval: null,
      status: "active",
      purchasedAt: "2026-09-01T00:00:00.000Z",
      currentPeriodEnd: null,
    });
    expect(billing.invoices).toHaveLength(2);
    const first = billing.invoices[0]; // newest first
    expect(first.amount).toBe(699);
    expect(first.status).toBe("paid");
    expect(first.description).toBe("Platform subscription");
    expect(first.pdfUrl).toBeNull();
  });

  it("is strictly tenant-scoped — a stranger never sees another tenant's rows", async () => {
    seedLedger({
      [T2]: [
        { id: "p1", type: "plan", tier: "growth", productName: "Growth Plan", amount: 1_500_000, status: "active", purchasedAt: "2026-09-01T00:00:00.000Z" },
      ],
    });
    const stranger = await bodyOf(await get(T1));
    expect(stranger.billing.source).toBe("none");
    expect(stranger.billing.subscription).toBeNull();
    expect(stranger.billing.invoices).toEqual([]);
    // And the owner of the rows can see them.
    const owner = await bodyOf(await get(T2));
    expect(owner.billing.source).toBe("durable");
    expect(owner.billing.subscription?.planName).toBe("Growth Plan");
    expect(owner.billing.invoices).toHaveLength(1);
  });

  it("treats generic purchase rows as invoice history only (no fabricated plan card)", async () => {
    seedLedger({
      [T1]: [
        { id: "g1", amount: 19900, status: "active", purchasedAt: "2026-10-01T00:00:00.000Z" },
        { id: "g2", amount: 69900, status: "paid", purchasedAt: "2026-10-02T00:00:00.000Z" },
      ],
    });
    const { billing } = await bodyOf(await get());
    expect(billing.subscription).toBeNull(); // no plan identity → no fabricated plan card
    expect(billing.source).toBe("durable");
    expect(billing.invoices).toHaveLength(2);
    expect(billing.invoices.map((i: any) => i.description)).toEqual(["Platform subscription", "Platform subscription"]);
  });

  it("is read-only: GET never mutates the ledger file", async () => {
    seedLedger({
      [T1]: [{ id: "p1", type: "plan", productName: "Starter Plan", amount: 750000, status: "active", purchasedAt: "2026-09-01T00:00:00.000Z" }],
    });
    const before = ledgerBytes();
    await get(T1);
    await get(T1);
    expect(ledgerBytes()).toBe(before);
  });
});

describe("native billing (P1-1) — Stripe API path (STRIPE_SECRET_KEY present)", () => {
  const KEY = "sk_test_fake";

  function stripeFetchStub(payloads: Record<string, unknown>) {
    return async (url: string) => {
      for (const [frag, payload] of Object.entries(payloads)) {
        if (url.includes(frag)) return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected url " + url } }), { status: 500 });
    };
  }

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("maps the customer's real Stripe subscription + invoices + card", async () => {
    process.env.STRIPE_SECRET_KEY = KEY;
    const fetchStub = stripeFetchStub({
      "/customers?": { data: [{ id: "cus_1", email: T1 }] },
      "/subscriptions?": {
        data: [{
          id: "sub_1",
          status: "active",
          current_period_end: 1780000000,
          items: { data: [{ price: { nickname: "Growth", unit_amount: 59900, recurring: { interval: "month" } } }] },
        }],
      },
      "/invoices?": {
        data: [{
          id: "in_1",
          created: 1770000000,
          amount_paid: 59900,
          status: "paid",
          hosted_invoice_url: "https://pay.stripe.com/invoice/in_1",
          lines: { data: [{ description: "Growth — monthly subscription" }] },
        }],
      },
      "/payment_methods?": { data: [{ card: { brand: "visa", last4: "4242" } }] },
    });
    const { billing } = await bodyOf(await get(T1, { stripeFetch: fetchStub }));
    expect(billing.source).toBe("stripe");
    expect(billing.subscription).toMatchObject({
      planName: "Growth",
      amount: 599,
      interval: "month",
      status: "active",
    });
    expect(billing.subscription.currentPeriodEnd).toBe(new Date(1780000000 * 1000).toISOString());
    expect(billing.invoices).toHaveLength(1);
    expect(billing.invoices[0]).toMatchObject({
      id: "in_1",
      amount: 599,
      status: "paid",
      pdfUrl: "https://pay.stripe.com/invoice/in_1",
      description: "Growth — monthly subscription",
    });
    expect(billing.paymentMethod).toEqual({ brand: "visa", last4: "4242" });
  });

  it("falls back to the honest durable ledger when Stripe has no customer for the tenant", async () => {
    process.env.STRIPE_SECRET_KEY = KEY;
    const fetchStub = stripeFetchStub({ "/customers?": { data: [] } });
    seedLedger({
      [T1]: [{ id: "p1", type: "plan", productName: "Starter Plan", amount: 750000, status: "active", purchasedAt: "2026-09-01T00:00:00.000Z" }],
    });
    const { billing } = await bodyOf(await get(T1, { stripeFetch: fetchStub }));
    expect(billing.source).toBe("durable");
    expect(billing.subscription?.planName).toBe("Starter Plan");
  });

  it("falls back to the honest durable ledger when the Stripe API call fails (never 500)", async () => {
    process.env.STRIPE_SECRET_KEY = KEY;
    const failingFetch = async () => { throw new Error("network down"); };
    seedLedger({
      [T1]: [{ id: "g1", amount: 69900, status: "paid", purchasedAt: "2026-10-01T00:00:00.000Z" }],
    });
    const res = await get(T1, { stripeFetch: failingFetch });
    expect(res.status).toBe(200);
    const { billing } = await bodyOf(res);
    expect(billing.source).toBe("durable");
    expect(billing.invoices).toHaveLength(1);
    expect(billing.invoices[0].amount).toBe(699);
  });

  it("never fabricates a plan card from Stripe HTTP errors", async () => {
    process.env.STRIPE_SECRET_KEY = KEY;
    const errStub = stripeFetchStub({});
    const res = await get(T1, { stripeFetch: errStub });
    expect(res.status).toBe(200);
    const { billing } = await bodyOf(res);
    expect(billing.source).toBe("none");
    expect(billing.subscription).toBeNull();
  });
});