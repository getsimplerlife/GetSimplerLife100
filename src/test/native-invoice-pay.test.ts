/**
 * native-invoice-pay.test.ts — GUARD TESTS for slice 134: a tenant collects
 * payment on their own invoice through THEIR OWN Stripe account.
 *
 * The rules these tests lock down (each is a real failure mode, not a style
 * preference):
 *   (a) NO Stripe connection → ZERO outbound provider calls, no pay button
 *       (`canPay === false`) and an honest 409. A platform that silently
 *       created sessions on an account nobody connected would be moving money
 *       nobody authorized.
 *   (b) Connected → ONE session created with the INVOICE'S OWN server-side
 *       amount/currency and the TENANT'S key, and that key never appears in a
 *       response, an audit line or the on-disk store (ciphertext only).
 *   (c) Unknown / foreign / non-sent slug → 404, exactly as before the slice.
 *   (d) Disconnect revokes: the next pay attempt fails closed with zero
 *       outbound calls.
 *   (e) Cross-tenant isolation: tenant A's key can never be used for tenant
 *       B's invoice.
 *   (f) The invoice is NEVER marked "paid" — only `paymentStartedAt`.
 *   (g) The platform's own Stripe account (the three subscription tiers) is
 *       never referenced by this lane.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insertInvoice, listAudit, registerInvoiceSlug, getInvoice } from "../native/invoice/store";
import { handleNativeInvoicesAuthed, handleNativeInvoiceShare } from "../native/invoice/router";
import { NATIVE_STRIPE_CONNECT_KEY } from "../native/invoice/stripe-connect";
import type { InvoiceRecord } from "../native/invoice/types";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
/** A shape-valid Stripe test-mode secret key (fake; never a real credential). */
const KEY_A = "sk_test_tenantA0000000000000000001";
const KEY_B = "sk_test_tenantB0000000000000000002";

let dir: string;
let fetchMock: ReturnType<typeof vi.fn>;
const savedEnv: Record<string, string | undefined> = {};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
/** The Stripe Checkout Session response we expect the lane to consume. */
function sessionResponse(url = "https://checkout.stripe.com/c/pay/cs_test_abc123"): Response {
  return jsonResponse(200, { id: "cs_test_abc123", url });
}

function req(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET" || method === "DELETE") return new Request(url, { method });
  return new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
function authed(method: string, pathname: string, body?: unknown, tenantId = T1) {
  return handleNativeInvoicesAuthed(req(method, pathname, body), { userEmail: tenantId, dataDir: dir });
}
function publicLane(method: string, pathname: string) {
  return handleNativeInvoiceShare(req(method, pathname), { dataDir: dir });
}

let invoiceSeq = 0;
/** Seed a SENT invoice that already carries a public share slug. */
function seedSentInvoice(tenantId: string, slug: string, opts: { amountDueCents?: number; currency?: string } = {}): InvoiceRecord {
  const now = new Date().toISOString();
  invoiceSeq += 1;
  const record: InvoiceRecord = {
    id: `inv_seed${String(invoiceSeq).padStart(4, "0")}`,
    tenantId,
    invoiceNumber: "INV-0001",
    linkedDealRoomId: "dea_seedroom0001",
    currency: opts.currency ?? "USD",
    lineItems: [{ id: "li_1", description: "Onboarding retainer", qty: 1, unitPriceCents: opts.amountDueCents ?? 250000 }],
    amountDueCents: opts.amountDueCents ?? 250000,
    status: "sent",
    docId: null,
    customerEmail: "client@acme.test",
    dueDate: "2026-11-28",
    shareSlug: slug,
    lastAttempt: null,
    version: 2,
    createdAt: now,
    createdBy: tenantId,
    updatedAt: now,
    updatedBy: tenantId,
    sentAt: now,
    sentBy: tenantId,
  };
  insertInvoice(dir, record);
  registerInvoiceSlug(dir, slug, tenantId);
  return record;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "invoice-pay-"));
  savedEnv.INTEGRATION_ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY;
  process.env.INTEGRATION_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = savedEnv.INTEGRATION_ENCRYPTION_KEY;
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("(a) no Stripe connection → zero outbound calls, no pay button, honest 409", () => {
  it("public view reports canPay=false and leaks no connection detail", async () => {
    seedSentInvoice(T1, "si_noconnect0001");
    const res = await publicLane("GET", "/api/native/invoice/share/si_noconnect0001");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.canPay).toBe(false);
    // The customer learns nothing about credentials — not even a hint.
    expect(body.data).not.toHaveProperty("hint");
    expect(body.data).not.toHaveProperty("keyMode");
    expect(JSON.stringify(body)).not.toMatch(/sk_test|rk_test|sk_live|rk_live/);
  });

  it("pay attempt fails closed with 409 and makes ZERO outbound calls", async () => {
    const seeded = seedSentInvoice(T1, "si_noconnect0002");
    const res = await publicLane("POST", "/api/native/invoice/share/si_noconnect0002/pay");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/arranged directly with the issuer/i);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    // No payment was started, so no stamp is written.
    expect(getInvoice(dir, T1, seeded.id)?.paymentStartedAt).toBeUndefined();
  });

  it("GET status for an unconnected tenant is honest and keyless", async () => {
    const res = await authed("GET", "/api/native/invoice/stripe");
    expect(res.status).toBe(200);
    // Slice 155 added `hasWebhookSecret` to the client-safe status (a boolean,
    // never a value) — the connection facts themselves are unchanged.
    expect((await res.json()).data).toMatchObject({ connected: false, hint: null, keyMode: null, addedAt: null, hasWebhookSecret: false });
  });
});

describe("(b) connected tenant → session on their account, invoice amount, key never leaked", () => {
  it("creates ONE session with the invoice's server-side amount and the tenant's key", async () => {
    const inv = seedSentInvoice(T1, "si_connected0001", { amountDueCents: 250000, currency: "USD" });
    const connect = await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    expect(connect.status).toBe(200);
    fetchMock.mockResolvedValueOnce(sessionResponse());

    const res = await publicLane("POST", "/api/native/invoice/share/si_connected0001/pay");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_abc123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, any];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.method).toBe("POST");
    // The TENANT's key — not a platform key.
    expect(init.headers.Authorization).toBe(`Bearer ${KEY_A}`);
    const form = new URLSearchParams(String(init.body));
    // The amount comes from the invoice RECORD, in the invoice's own currency.
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe(String(inv.amountDueCents));
    expect(form.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(form.get("mode")).toBe("payment");
    expect(form.get("client_reference_id")).toBe(inv.invoiceNumber);
    // The key is NEVER part of the outbound form body.
    expect(String(init.body)).not.toContain(KEY_A);
  });

  it("ignores any amount a payer tries to inject (server-side amount only)", async () => {
    seedSentInvoice(T1, "si_connected0002", { amountDueCents: 250000 });
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    fetchMock.mockResolvedValueOnce(sessionResponse());

    const res = await handleNativeInvoiceShare(
      new Request("http://native.test/api/native/invoice/share/si_connected0002/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountDueCents: 1, amount: 1, currency: "jpy" }),
      }),
      { dataDir: dir },
    );
    expect(res.status).toBe(200);
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, any])[1].body));
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("250000");
    expect(form.get("line_items[0][price_data][currency]")).toBe("usd");
  });

  it("the key never appears in a response, an audit line, or the store at rest", async () => {
    seedSentInvoice(T1, "si_connected0003");
    const connect = await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    const connectText = await connect.text();
    expect(connectText).not.toContain(KEY_A);
    const connectJson = JSON.parse(connectText);
    expect(connectJson.data).toMatchObject({
      connected: true,
      hint: "•••• " + KEY_A.slice(-4),
      keyMode: "test",
      addedAt: expect.any(String),
      hasWebhookSecret: false, // slice 155 field; no signing secret pasted here
    });

    fetchMock.mockResolvedValueOnce(sessionResponse());
    const pay = await publicLane("POST", "/api/native/invoice/share/si_connected0003/pay");
    const payText = await pay.text();
    expect(payText).not.toContain(KEY_A);

    // Status lane: keyless.
    const statusText = await (await authed("GET", "/api/native/invoice/stripe")).text();
    expect(statusText).not.toContain(KEY_A);

    // Audit: mask only.
    const audit = listAudit(dir, T1);
    const connected = audit.find((a) => a.action === "native.invoice.stripe.connected");
    expect(connected).toBeTruthy();
    expect(connected!.detail).not.toContain(KEY_A);
    expect(connected!.detail).toContain(KEY_A.slice(-4));
    const started = audit.find((a) => a.action === "native.invoice.payment.started");
    expect(started).toBeTruthy();
    expect(started!.detail).not.toContain(KEY_A);

    // At rest: ciphertext only (iv:tag:hex), never the plaintext key.
    const raw = readFileSync(join(dir, NATIVE_STRIPE_CONNECT_KEY), "utf8");
    expect(raw).not.toContain(KEY_A);
    expect(raw).toMatch(/[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+/);
  });

  it("a provider error is honest (502), never a fake success, and scrubs the key", async () => {
    const seeded = seedSentInvoice(T1, "si_connected0004");
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { message: `Invalid API Key provided: ${KEY_A}` } }),
    );
    const res = await publicLane("POST", "/api/native/invoice/share/si_connected0004/pay");
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain(KEY_A);
    const body = JSON.parse(text);
    expect(body.error).toMatch(/No payment was started/i);
    expect(getInvoice(dir, T1, seeded.id)?.paymentStartedAt).toBeUndefined();
  });

  it("records paymentStartedAt and NEVER marks the invoice paid", async () => {
    const seeded = seedSentInvoice(T1, "si_connected0005");
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    fetchMock.mockResolvedValueOnce(sessionResponse());
    await publicLane("POST", "/api/native/invoice/share/si_connected0005/pay");
    const inv = getInvoice(dir, T1, seeded.id)!;
    expect(inv.paymentStartedAt).toEqual(expect.any(String));
    // The status machine is untouched: still "sent", never "paid".
    expect(inv.status).toBe("sent");
    const view = (await (await publicLane("GET", "/api/native/invoice/share/si_connected0005")).json()).data;
    expect(view.status).toBe("sent");
    expect(view.paymentStartedAt).toEqual(expect.any(String));
  });
});

describe("(c) unknown / foreign / non-sent slug → 404 exactly as before", () => {
  it("unknown slug → 404 for pay, zero outbound calls", async () => {
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    const res = await publicLane("POST", "/api/native/invoice/share/si_doesnotexist9999/pay");
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("malformed slug → 404", async () => {
    const res = await publicLane("POST", "/api/native/invoice/share/not-a-slug/pay");
    expect(res.status).toBe(404);
  });

  it("a draft invoice is never payable (404)", async () => {
    const now = new Date().toISOString();
    insertInvoice(dir, {
      id: "inv_draft0001",
      tenantId: T1,
      invoiceNumber: "INV-0002",
      linkedDealRoomId: "dea_seedroom0001",
      currency: "USD",
      lineItems: [{ id: "li_1", description: "Draft", qty: 1, unitPriceCents: 1000 }],
      amountDueCents: 1000,
      status: "draft",
      docId: null,
      customerEmail: "client@acme.test",
      dueDate: "2026-11-28",
      shareSlug: "si_draft0001",
      lastAttempt: null,
      version: 1,
      createdAt: now,
      createdBy: T1,
      updatedAt: now,
      updatedBy: T1,
    });
    registerInvoiceSlug(dir, "si_draft0001", T1);
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    const res = await publicLane("POST", "/api/native/invoice/share/si_draft0001/pay");
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("a stale index entry (slug points at a missing invoice) → 404", async () => {
    registerInvoiceSlug(dir, "si_stale0001", T1);
    const res = await publicLane("POST", "/api/native/invoice/share/si_stale0001/pay");
    expect(res.status).toBe(404);
  });
});

describe("(d) disconnect revokes the lane", () => {
  it("after DELETE the next pay attempt fails closed with zero outbound calls", async () => {
    seedSentInvoice(T1, "si_revoke0001");
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    const del = await authed("DELETE", "/api/native/invoice/stripe");
    expect(del.status).toBe(200);
    const delBody = await del.json();
    expect(delBody.data).toMatchObject({ connected: false, removed: true });

    fetchMock.mockClear();
    const res = await publicLane("POST", "/api/native/invoice/share/si_revoke0001/pay");
    expect(res.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(0);

    // Revocation is audited with the mask only.
    const audit = listAudit(dir, T1);
    const gone = audit.find((a) => a.action === "native.invoice.stripe.disconnected");
    expect(gone).toBeTruthy();
    expect(gone!.detail).not.toContain(KEY_A);

    // And the public page stops offering payment.
    const view = (await (await publicLane("GET", "/api/native/invoice/share/si_revoke0001")).json()).data;
    expect(view.canPay).toBe(false);
  });

  it("disconnecting twice is idempotent (removed:false, no second audit line)", async () => {
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    await authed("DELETE", "/api/native/invoice/stripe");
    const again = await (await authed("DELETE", "/api/native/invoice/stripe")).json();
    expect(again.data).toMatchObject({ connected: false, removed: false });
    expect(listAudit(dir, T1).filter((a) => a.action === "native.invoice.stripe.disconnected")).toHaveLength(1);
  });
});

describe("(e) cross-tenant key isolation", () => {
  it("tenant A's key is never used for tenant B's invoice", async () => {
    // A connects; B does not.
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A }, T1);
    seedSentInvoice(T2, "si_tenantb0001");

    // B's status is its own (unconnected) — A's connection does not leak.
    const statusB = (await (await authed("GET", "/api/native/invoice/stripe", undefined, T2)).json()).data;
    expect(statusB).toMatchObject({ connected: false, hint: null, keyMode: null, addedAt: null, hasWebhookSecret: false });

    const res = await publicLane("POST", "/api/native/invoice/share/si_tenantb0001/pay");
    expect(res.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("each tenant's session uses its own key", async () => {
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A }, T1);
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_B }, T2);
    seedSentInvoice(T1, "si_ownkey0001");
    seedSentInvoice(T2, "si_ownkey0002");

    fetchMock.mockImplementation(async () => sessionResponse());
    await publicLane("POST", "/api/native/invoice/share/si_ownkey0001/pay");
    await publicLane("POST", "/api/native/invoice/share/si_ownkey0002/pay");

    const auths = fetchMock.mock.calls.map((c) => (c as [string, any])[1].headers.Authorization);
    expect(auths).toEqual([`Bearer ${KEY_A}`, `Bearer ${KEY_B}`]);
  });
});

describe("credential validation happens BEFORE storage", () => {
  it("rejects a publishable key with 400 and stores nothing", async () => {
    const res = await authed("POST", "/api/native/invoice/stripe", { secretKey: "pk_test_publishable0000000001" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/publishable/i);
    expect((await (await authed("GET", "/api/native/invoice/stripe")).json()).data.connected).toBe(false);
  });

  it("rejects junk / empty / non-string with 400 and no audit line", async () => {
    for (const secretKey of ["", "   ", "hello", 12345, null]) {
      const res = await authed("POST", "/api/native/invoice/stripe", { secretKey });
      expect(res.status).toBe(400);
    }
    const missing = await authed("POST", "/api/native/invoice/stripe", {});
    expect(missing.status).toBe(400);
    expect(listAudit(dir, T1).filter((a) => a.action.startsWith("native.invoice.stripe"))).toHaveLength(0);
  });

  it("accepts a restricted key (rk_) as well as a secret key (sk_)", async () => {
    const res = await authed("POST", "/api/native/invoice/stripe", { secretKey: "rk_test_restricted00000000001" });
    expect(res.status).toBe(200);
    expect((await res.json()).data.keyMode).toBe("test");
  });

  it("the pay endpoint is POST-only on the public lane", async () => {
    seedSentInvoice(T1, "si_method0001");
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    const res = await publicLane("GET", "/api/native/invoice/share/si_method0001/pay");
    expect(res.status).toBe(405);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});

describe("(g) the platform's own subscription account is never referenced", () => {
  it("this lane holds no platform Stripe link or account key", () => {
    const files = ["stripe-connect.ts", "stripe-checkout.ts", "router.ts"].map((f) =>
      readFileSync(join(process.cwd(), "src", "native", "invoice", f), "utf8"),
    );
    for (const body of files) {
      expect(body).not.toContain("buy.stripe.com");
      expect(body).not.toContain("STRIPE_SECRET_KEY");
      expect(body).not.toContain("STRIPE_WEBHOOK_SECRET");
    }
  });
});
