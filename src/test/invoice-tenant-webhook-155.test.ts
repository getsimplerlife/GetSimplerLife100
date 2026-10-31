/**
 * invoice-tenant-webhook-155.test.ts — SLICE 155 guard tests. The tenant's own
 * Stripe webhook, and the one behaviour that matters most: a validly-signed
 * event whose amount does not match the invoice must NOT mark it paid.
 *
 * WHY THIS FILE EXISTS. Before slice 155 the pay handoff wrote
 * `paymentStartedAt` and the audit line said outright that the invoice was not
 * marked paid because confirming a payment needed a webhook that did not exist.
 * The customer paid, the money landed in the tenant's own Stripe account, and
 * our invoice still said "sent". This lane closes that gap — which means it now
 * has the power to say "paid", and every way that power can be wrong needs a
 * test:
 *
 *   (a) correct signature + the invoice's own amount → paid, audited, immutable;
 *   (b) correct signature + WRONG amount → NOT paid, mismatch recorded (the
 *       whole point: money in the tenant's account is not proof that THIS
 *       invoice was settled);
 *   (c) wrong currency → same refusal;
 *   (d) unknown path token → 404, nothing written anywhere;
 *   (e) a body signed with tenant A's secret posted to tenant B's address →
 *       rejected, and neither tenant is written;
 *   (f) forged / missing / stale signatures → 400-401, nothing written;
 *   (g) the same event id twice → ONE effect;
 *   (h) unknown event types → 200 with no effect (Stripe must not retry);
 *   (i) expired / failed payment events → recorded, never a paid state;
 *   (j) the signing secret and the API key never come back from any response,
 *       and both are ciphertext at rest;
 *   (k) the webhook address is stable across a disconnect and a fresh connect,
 *       and only an explicit rotate replaces it;
 *   (l) the checkout session id is persisted when the session is created.
 *
 * Every request here is built locally and signed with a locally-known secret:
 * no network call to Stripe, no real credential anywhere in this file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { insertInvoice, listAudit, registerInvoiceSlug, getInvoice } from "../native/invoice/store";
import { handleNativeInvoicesAuthed, handleNativeInvoiceShare } from "../native/invoice/router";
import { handleTenantInvoiceStripeWebhook } from "../native/invoice/stripe-webhook";
import { NATIVE_STRIPE_CONNECT_KEY } from "../native/invoice/stripe-connect";
import { NATIVE_INVOICE_WEBHOOK_EVENTS_KEY, type InvoiceRecord } from "../native/invoice/types";
import { laneForRequest } from "../lib/rate-limit";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
/** Shape-valid, entirely fake credentials — never real Stripe material. */
const KEY_A = "sk_test_tenantA0000000000000000001";
const KEY_B = "sk_test_tenantB0000000000000000002";
const WHSEC_A = "whsec_testTenantA0000000000000000001";
const WHSEC_B = "whsec_testTenantB0000000000000000002";

let dir: string;
let fetchMock: ReturnType<typeof vi.fn>;
const savedEnv: Record<string, string | undefined> = {};

// ── harness ─────────────────────────────────────────────────────────────────
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

/** Sign exactly as Stripe does: HMAC-SHA256 over `${t}.${rawBody}`. */
function sign(rawBody: string, secret: string, tsSeconds = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac("sha256", secret).update(`${tsSeconds}.${rawBody}`).digest("hex");
  return `t=${tsSeconds},v1=${sig}`;
}

/** POST a raw body at a webhook path, with (or without) a signature header. */
function postWebhook(pathname: string, rawBody: string, signatureHeader?: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signatureHeader !== undefined && signatureHeader !== null) headers["stripe-signature"] = signatureHeader;
  return handleTenantInvoiceStripeWebhook(
    new Request(`http://native.test${pathname}`, { method: "POST", headers, body: rawBody }),
    { dataDir: dir },
  );
}

function paymentAudit(tenantId: string) {
  // The GET lane mints the webhook ADDRESS on first read and audits that fact
  // (an address was issued). These tests care about PAYMENT effects, so they
  // filter to the payment actions rather than asserting an empty audit trail.
  return listAudit(dir, tenantId).filter((a) => a.action.startsWith("native.invoice.payment"));
}
let seq = 0;
function seedSentInvoice(
  tenantId: string,
  opts: { invoiceNumber: string; slug: string; amountDueCents?: number; currency?: string },
): InvoiceRecord {
  const now = new Date().toISOString();
  seq += 1;
  const record: InvoiceRecord = {
    id: `inv_w155${String(seq).padStart(4, "0")}`,
    tenantId,
    invoiceNumber: opts.invoiceNumber,
    linkedDealRoomId: "dea_seedroom0001",
    currency: opts.currency ?? "USD",
    lineItems: [
      { id: "li_1", description: "Onboarding retainer", qty: 1, unitPriceCents: opts.amountDueCents ?? 250000 },
    ],
    amountDueCents: opts.amountDueCents ?? 250000,
    status: "sent",
    docId: null,
    customerEmail: "client@acme.test",
    dueDate: "2026-11-28",
    shareSlug: opts.slug,
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
  registerInvoiceSlug(dir, opts.slug, tenantId);
  return record;
}

/** Connect a tenant's own Stripe account (key + endpoint signing secret). */
async function connect(tenantId: string, key: string, webhookSecret: string): Promise<void> {
  const res = await authed("POST", "/api/native/invoice/stripe", { secretKey: key, webhookSecret }, tenantId);
  expect(res.status).toBe(200);
}

/** The address this tenant pastes into their Stripe dashboard (path only). */
async function webhookPath(tenantId = T1): Promise<string> {
  const res = await authed("GET", "/api/native/invoice/stripe", undefined, tenantId);
  expect(res.status).toBe(200);
  const body = await res.json();
  return new URL(body.data.webhookUrl).pathname;
}

/** A checkout-session event shaped like the real thing (ids are fake). */
function checkoutEvent(opts: {
  id?: string;
  type?: string;
  sessionId?: string;
  invoiceNumber?: string | null;
  amount?: number | null;
  currency?: string | null;
  paymentStatus?: string | null;
}): string {
  const session: Record<string, unknown> = {
    id: opts.sessionId ?? "cs_test_paid0001",
    object: "checkout.session",
    client_reference_id: opts.invoiceNumber === null ? undefined : opts.invoiceNumber ?? "INV-0001",
    metadata: opts.invoiceNumber === null ? {} : { invoice_number: opts.invoiceNumber ?? "INV-0001" },
    amount_total: opts.amount === null ? undefined : opts.amount ?? 250000,
    currency: opts.currency === null ? undefined : opts.currency ?? "usd",
    payment_status: opts.paymentStatus === null ? undefined : opts.paymentStatus ?? "paid",
    mode: "payment",
  };
  return JSON.stringify({
    id: opts.id ?? "evt_test_0001",
    object: "event",
    type: opts.type ?? "checkout.session.completed",
    api_version: "2024-06-20",
    data: { object: session },
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "invoice-webhook-155-"));
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

// ── (a) the happy path ──────────────────────────────────────────────────────
describe("(a) a verified event that matches the invoice marks it paid", () => {
  it("marks it paid, keeps status sent, and appends an immutable audit entry", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_paid0001", amountDueCents: 250000 });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = checkoutEvent({ invoiceNumber: "INV-0001", amount: 250000, currency: "usd" });

    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: "paid" });

    const record = getInvoice(dir, T1, inv.id)!;
    expect(record.payment).toMatchObject({
      amountCents: 250000,
      currency: "USD",
      sessionId: "cs_test_paid0001",
      eventId: "evt_test_0001",
    });
    expect(record.payment!.paidAt).toEqual(expect.any(String));
    // Payment is an ADDITIVE fact: the document's terminal state is untouched.
    expect(record.status).toBe("sent");
    expect(record.amountDueCents).toBe(250000);
    expect(record.version).toBe(3); // one write, one version bump

    // The audit line names the amount and the ids, and nothing secret.
    const audit = listAudit(dir, T1);
    const confirmed = audit.filter((a) => a.action === "native.invoice.payment.confirmed");
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].invoiceId).toBe(inv.id);
    expect(confirmed[0].detail).toContain("USD 2,500.00");
    expect(confirmed[0].detail).toContain("cs_test_paid0001");
    expect(confirmed[0].detail).toContain("evt_test_0001");
    for (const entry of audit) {
      expect(entry.detail).not.toContain(WHSEC_A);
      expect(entry.detail).not.toContain(KEY_A);
    }

    // And the customer's own page now reads paid.
    const view = (await (await publicLane("GET", "/api/native/invoice/share/si_paid0001")).json()).data;
    expect(view.paid).toBe(true);
    expect(view.paidAt).toEqual(expect.any(String));
    expect(view.amountPaidCents).toBe(250000);
    expect(view.status).toBe("sent");
  });

  it("async_payment_succeeded is treated exactly like completed", async () => {
    seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_async0001", amountDueCents: 9900 });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = checkoutEvent({ type: "checkout.session.async_payment_succeeded", amount: 9900, invoiceNumber: "INV-0001" });
    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("paid");
  });

  it("a completed session whose payment_status is not paid stays UNPAID (async methods)", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_pending001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = checkoutEvent({ paymentStatus: "unpaid" });
    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("recorded");
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();
    expect(listAudit(dir, T1).some((a) => a.action === "native.invoice.payment.pending")).toBe(true);
  });
});

// ── (b) THE test: valid signature, wrong amount ─────────────────────────────
describe("(b) a validly signed event with the WRONG amount does NOT mark it paid", () => {
  it("records the mismatch, leaves the record untouched, and says so", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_mismatch01", amountDueCents: 250000 });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    // Perfectly valid signature. One cent short of the invoice.
    const raw = checkoutEvent({ amount: 249999, currency: "usd" });

    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(200); // Stripe must not retry: a retry cannot fix this
    expect(await res.json()).toEqual({ received: true, outcome: "mismatch" });

    const record = getInvoice(dir, T1, inv.id)!;
    expect(record.payment).toBeUndefined();
    expect(record.status).toBe("sent");
    expect(record.amountDueCents).toBe(250000);
    expect(record.version).toBe(2); // NOTHING was written to the record

    const mismatch = listAudit(dir, T1).filter((a) => a.action === "native.invoice.payment.mismatch");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0].invoiceId).toBe(inv.id);
    expect(mismatch[0].detail).toContain("USD 2,499.99");
    expect(mismatch[0].detail).toContain("USD 2,500.00");
    expect(mismatch[0].detail).toContain("NOT marked paid");

    const view = (await (await publicLane("GET", "/api/native/invoice/share/si_mismatch01")).json()).data;
    expect(view.paid).toBe(false);
    expect(view.paidAt).toBeNull();
    expect(view.amountPaidCents).toBeNull();
    expect(view.amountDueCents).toBe(250000);
  });

  it("an OVERPAYMENT is a mismatch too — the invoice is not settled by a bigger number", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_overpay001", amountDueCents: 250000 });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = checkoutEvent({ amount: 250001 });
    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect((await res.json()).outcome).toBe("mismatch");
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();
  });
});

// ── (c) wrong currency ──────────────────────────────────────────────────────
describe("(c) currency must match the invoice", () => {
  it("a matching amount in the wrong currency is not paid", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_currency01", amountDueCents: 250000 });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = checkoutEvent({ amount: 250000, currency: "eur" });
    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect((await res.json()).outcome).toBe("mismatch");
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();
    const line = listAudit(dir, T1).find((a) => a.action === "native.invoice.payment.mismatch")!;
    expect(line.detail).toContain("EUR");
    expect(line.detail).toContain("USD");
  });
});

// ── (d) unknown token ───────────────────────────────────────────────────────
describe("(d) an unknown webhook address reveals nothing and writes nothing", () => {
  it("returns a plain 404 for a well-shaped token nobody issued", async () => {
    seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_unknown001" });
    await connect(T1, KEY_A, WHSEC_A);
    const raw = checkoutEvent({});
    const bogus = "A".repeat(43);
    const res = await postWebhook(`/api/native/invoice/webhook/stripe/${bogus}`, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect(paymentAudit(T1)).toHaveLength(0);
  });

  it("rejects a malformed token (wrong length / extra path segment) with 404", async () => {
    const raw = checkoutEvent({});
    for (const bad of ["short", "A".repeat(43) + "/extra", "!".repeat(43)]) {
      const res = await postWebhook(`/api/native/invoice/webhook/stripe/${bad}`, raw, sign(raw, WHSEC_A));
      expect(res.status).toBe(404);
    }
  });

  it("an unconfigured tenant (key but no signing secret) answers 400 and writes nothing", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_nosecret01" });
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    const path = await webhookPath();
    const raw = checkoutEvent({});
    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(400);
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();
  });
});

// ── (e) cross-tenant ────────────────────────────────────────────────────────
describe("(e) one tenant's signature can never act on another tenant's address", () => {
  it("A-signed body at B's address is rejected and neither tenant is written", async () => {
    const invA = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_tenantA001" });
    seedSentInvoice(T2, { invoiceNumber: "INV-0001", slug: "si_tenantB001" });
    await connect(T1, KEY_A, WHSEC_A);
    await connect(T2, KEY_B, WHSEC_B);
    const pathB = await webhookPath(T2);
    const raw = checkoutEvent({ invoiceNumber: "INV-0001", amount: 250000 });

    const res = await postWebhook(pathB, raw, sign(raw, WHSEC_A)); // wrong secret for B
    expect(res.status).toBe(401);
    expect(getInvoice(dir, T1, invA.id)!.payment).toBeUndefined();
    expect(paymentAudit(T1)).toHaveLength(0);
    expect(paymentAudit(T2)).toHaveLength(0);
  });

  it("B's own valid event naming A's invoice number does not resolve in B", async () => {
    const invA = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_tenantA002" });
    await connect(T2, KEY_B, WHSEC_B);
    const pathB = await webhookPath(T2);
    const raw = checkoutEvent({ invoiceNumber: "INV-0001", amount: 250000 });

    const res = await postWebhook(pathB, raw, sign(raw, WHSEC_B));
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("mismatch");
    expect(getInvoice(dir, T1, invA.id)!.payment).toBeUndefined();
    // The mismatch is recorded against the tenant whose address was used.
    const line = listAudit(dir, T2).find((a) => a.action === "native.invoice.payment.mismatch")!;
    expect(line.detail).toContain("no invoice INV-0001 exists in this workspace");
  });
});

// ── (f) bad signatures ──────────────────────────────────────────────────────
describe("(f) forged, missing and stale signatures are refused with nothing written", () => {
  it("a forged signature is 401", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_forged0001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = checkoutEvent({});
    const forged = sign(raw, "whsec_someOtherSecret0000000000001");
    const res = await postWebhook(path, raw, forged);
    expect(res.status).toBe(401);
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();
    expect(paymentAudit(T1)).toHaveLength(0);
  });

  it("a tampered body under a genuine signature is 401", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_tamper0001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const signedBody = checkoutEvent({ amount: 250000 });
    const header = sign(signedBody, WHSEC_A);
    const tampered = checkoutEvent({ amount: 1 });
    const res = await postWebhook(path, tampered, header);
    expect(res.status).toBe(401);
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();
  });

  it("a missing signature header is 400", async () => {
    seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_nosig00001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const res = await postWebhook(path, checkoutEvent({}), null);
    expect(res.status).toBe(400);
    expect(paymentAudit(T1)).toHaveLength(0);
  });

  it("a stale timestamp (10 minutes old) is 401, so a captured payload cannot be replayed", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_stale00001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = checkoutEvent({});
    const stale = sign(raw, WHSEC_A, Math.floor(Date.now() / 1000) - 600);
    const res = await postWebhook(path, raw, stale);
    expect(res.status).toBe(401);
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();
  });
});

// ── (g) idempotency ─────────────────────────────────────────────────────────
describe("(g) Stripe retries: one event id, one effect", () => {
  it("the same event delivered twice applies once", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_idem000001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = checkoutEvent({ id: "evt_test_retry01" });
    const header = sign(raw, WHSEC_A);

    const first = await postWebhook(path, raw, header);
    expect((await first.json()).outcome).toBe("paid");
    const second = await postWebhook(path, raw, header);
    expect(second.status).toBe(200);
    expect((await second.json()).outcome).toBe("duplicate");

    expect(listAudit(dir, T1).filter((a) => a.action === "native.invoice.payment.confirmed")).toHaveLength(1);
    expect(getInvoice(dir, T1, inv.id)!.version).toBe(3); // one write only
  });

  it("two different events cannot both flip the same invoice", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_twice00001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();

    const firstBody = checkoutEvent({ id: "evt_test_first01", sessionId: "cs_test_first01" });
    expect((await (await postWebhook(path, firstBody, sign(firstBody, WHSEC_A))).json()).outcome).toBe("paid");

    // Same session, different event id → nothing new to apply.
    const sameSession = checkoutEvent({ id: "evt_test_first02", sessionId: "cs_test_first01" });
    expect((await (await postWebhook(path, sameSession, sign(sameSession, WHSEC_A))).json()).outcome).toBe("duplicate");

    // A DIFFERENT session for the same invoice is refused, not applied.
    const otherSession = checkoutEvent({ id: "evt_test_second1", sessionId: "cs_test_second1" });
    expect((await (await postWebhook(path, otherSession, sign(otherSession, WHSEC_A))).json()).outcome).toBe("mismatch");

    const record = getInvoice(dir, T1, inv.id)!;
    expect(record.payment!.sessionId).toBe("cs_test_first01");
    expect(listAudit(dir, T1).filter((a) => a.action === "native.invoice.payment.confirmed")).toHaveLength(1);
  });

  it("keeps the processed-id list bounded and de-duplicated on disk", async () => {
    seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_bounded001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = checkoutEvent({ id: "evt_test_bounded1" });
    await postWebhook(path, raw, sign(raw, WHSEC_A));
    await postWebhook(path, raw, sign(raw, WHSEC_A));
    const stored = JSON.parse(readFileSync(join(dir, NATIVE_INVOICE_WEBHOOK_EVENTS_KEY), "utf8"));
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toEqual(["evt_test_bounded1"]);
  });
});

// ── (h) unknown event types ─────────────────────────────────────────────────
describe("(h) an event type this build does not act on is acknowledged with no effect", () => {
  it("returns 200 ignored and writes nothing", async () => {
    seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_unknown002" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = JSON.stringify({ id: "evt_test_unknown1", type: "customer.created", data: { object: { id: "cus_1" } } });
    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: "ignored" });
    expect(paymentAudit(T1)).toHaveLength(0);
  });

  it("a signature-verified body that is not an event object is 400", async () => {
    seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_badbody001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = JSON.stringify({ hello: "world" });
    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(400);
    expect(paymentAudit(T1)).toHaveLength(0);
  });

  it("the endpoint is POST-only", async () => {
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const res = await handleTenantInvoiceStripeWebhook(
      new Request(`http://native.test${path}`, { method: "GET" }),
      { dataDir: dir },
    );
    expect(res.status).toBe(405);
  });
});

// ── (i) expired / failed ────────────────────────────────────────────────────
describe("(i) expired and failed payments are recorded honestly and never paid", () => {
  it("checkout.session.expired leaves the invoice unpaid", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_expired001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = checkoutEvent({ id: "evt_test_expired1", type: "checkout.session.expired", paymentStatus: "unpaid" });
    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("recorded");
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();
    const line = listAudit(dir, T1).find((a) => a.action === "native.invoice.payment.expired")!;
    expect(line.invoiceId).toBe(inv.id);
    expect(line.detail).toContain("expired without payment");
  });

  it("payment_intent.payment_failed is recorded without claiming an invoice", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_failed0001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    const raw = JSON.stringify({
      id: "evt_test_failed01",
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_test_1", amount: 250000, currency: "usd", last_payment_error: { message: "Your card was declined." } } },
    });
    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("recorded");
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();
    const line = listAudit(dir, T1).find((a) => a.action === "native.invoice.payment.failed")!;
    expect(line.invoiceId).toBe(""); // it cannot be tied to our invoice — say so
    expect(line.detail).toContain("Your card was declined.");
    expect(line.detail).toContain("No invoice was marked paid");
  });
});

// ── (j) secrets never leave ─────────────────────────────────────────────────
describe("(j) the signing secret and the API key are never returned, and are ciphertext at rest", () => {
  it("GET exposes only hasWebhookSecret and the address", async () => {
    await connect(T1, KEY_A, WHSEC_A);
    const res = await authed("GET", "/api/native/invoice/stripe");
    const text = await res.text();
    expect(text).not.toContain(WHSEC_A);
    expect(text).not.toContain(KEY_A);
    expect(text).not.toContain("whsec_");
    const data = JSON.parse(text).data;
    expect(data).toMatchObject({ connected: true, hasWebhookSecret: true, keyMode: "test" });
    expect(data.hint).toBe("•••• " + KEY_A.slice(-4));
    expect(data.webhookUrl).toMatch(/\/api\/native\/invoice\/webhook\/stripe\/[A-Za-z0-9_-]{43}$/);
  });

  it("the POST response and the audit trail never contain either secret", async () => {
    const res = await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A, webhookSecret: WHSEC_A });
    const text = await res.text();
    expect(text).not.toContain(WHSEC_A);
    expect(text).not.toContain(KEY_A);
    expect(JSON.parse(text).data.hasWebhookSecret).toBe(true);
    const audit = listAudit(dir, T1);
    expect(audit.some((a) => a.action === "native.invoice.stripe.webhook.configured")).toBe(true);
    for (const entry of audit) {
      expect(entry.detail).not.toContain(WHSEC_A);
      expect(entry.detail).not.toContain(KEY_A);
    }
  });

  it("at rest both secrets are AES-256-GCM ciphertext, never plaintext", async () => {
    await connect(T1, KEY_A, WHSEC_A);
    const raw = readFileSync(join(dir, NATIVE_STRIPE_CONNECT_KEY), "utf8");
    expect(raw).not.toContain(KEY_A);
    expect(raw).not.toContain(WHSEC_A);
    expect(raw).not.toContain("whsec_");
    // Two independent iv:tag:ciphertext blobs — the key and the signing secret.
    expect(raw.match(/[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+/g)?.length).toBe(2);
  });

  it("a webhook secret pasted on its own (PUT) is stored without re-pasting the key", async () => {
    await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    expect((await (await authed("GET", "/api/native/invoice/stripe")).json()).data.hasWebhookSecret).toBe(false);
    const put = await authed("PUT", "/api/native/invoice/stripe", { webhookSecret: WHSEC_A });
    expect(put.status).toBe(200);
    const text = await put.text();
    expect(text).not.toContain(WHSEC_A);
    expect(JSON.parse(text).data).toMatchObject({ connected: true, hasWebhookSecret: true });
  });

  it("a malformed webhook secret is rejected with 400 and stores nothing", async () => {
    const res = await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A, webhookSecret: "nope" });
    expect(res.status).toBe(400);
    const status = (await (await authed("GET", "/api/native/invoice/stripe")).json()).data;
    expect(status.hasWebhookSecret).toBe(false);
  });

  it("disconnect removes the signing secret too, so the endpoint stops verifying", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_disc000001" });
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath();
    await authed("DELETE", "/api/native/invoice/stripe");
    const raw = checkoutEvent({});
    const res = await postWebhook(path, raw, sign(raw, WHSEC_A));
    expect(res.status).toBe(400); // not configured any more
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();
  });
});

// ── (k) a stable address ────────────────────────────────────────────────────
describe("(k) the webhook address is stable, and only an explicit rotate replaces it", () => {
  it("survives a disconnect and a fresh connect unchanged", async () => {
    await connect(T1, KEY_A, WHSEC_A);
    const first = await webhookPath();
    await authed("DELETE", "/api/native/invoice/stripe");
    const between = await webhookPath();
    await connect(T1, KEY_A, WHSEC_A);
    const after = await webhookPath();
    expect(between).toBe(first);
    expect(after).toBe(first);
  });

  it("rotate issues a new address and kills the old one immediately", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_rotate0001" });
    await connect(T1, KEY_A, WHSEC_A);
    const before = await webhookPath();

    const rotate = await authed("POST", "/api/native/invoice/stripe/webhook/rotate");
    expect(rotate.status).toBe(200);
    const rotated = (await rotate.json()).data;
    expect(rotated.previousUrlDead).toBe(true);
    expect(rotated.hasWebhookSecret).toBe(true);
    const after = new URL(rotated.webhookUrl).pathname;
    expect(after).not.toBe(before);

    const raw = checkoutEvent({});
    const stale = await postWebhook(before, raw, sign(raw, WHSEC_A));
    expect(stale.status).toBe(404);
    expect(getInvoice(dir, T1, inv.id)!.payment).toBeUndefined();

    const fresh = await postWebhook(after, raw, sign(raw, WHSEC_A));
    expect(fresh.status).toBe(200);
    expect((await fresh.json()).outcome).toBe("paid");
  });
});

// ── (l) the session id is captured at creation ──────────────────────────────
describe("(l) the checkout session id is persisted when the session is created", () => {
  it("records lastCheckoutSessionId so a later revoke can expire the session", async () => {
    const inv = seedSentInvoice(T1, { invoiceNumber: "INV-0001", slug: "si_session001", amountDueCents: 250000 });
    await connect(T1, KEY_A, WHSEC_A);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "cs_test_captured01", url: "https://checkout.stripe.com/c/pay/cs_test_captured01" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const pay = await publicLane("POST", "/api/native/invoice/share/si_session001/pay");
    expect(pay.status).toBe(200);
    const record = getInvoice(dir, T1, inv.id)!;
    expect(record.lastCheckoutSessionId).toBe("cs_test_captured01");
    // Still NOT paid: starting a payment is not money.
    expect(record.payment).toBeUndefined();
    expect(record.paymentStartedAt).toEqual(expect.any(String));
  });
});

// ── wiring ──────────────────────────────────────────────────────────────────
describe("wiring", () => {
  it("the webhook path has its own rate-limit lane, on POST only", () => {
    expect(laneForRequest("/api/native/invoice/webhook/stripe/" + "A".repeat(43), "POST")).toBe("invoice-webhook");
    expect(laneForRequest("/api/native/invoice/webhook/stripe/" + "A".repeat(43), "GET")).toBeNull();
  });

  it("this lane never references the platform's own Stripe account", () => {
    const bodies = ["stripe-webhook.ts", "webhook-token.ts"].map((f) =>
      readFileSync(join(process.cwd(), "src", "native", "invoice", f), "utf8"),
    );
    for (const body of bodies) {
      expect(body).not.toContain("buy.stripe.com");
      expect(body).not.toContain("STRIPE_SECRET_KEY");
      expect(body).not.toContain("STRIPE_WEBHOOK_SECRET");
    }
  });
});

// ── (m) an oversized body is refused BEFORE it is buffered ──────────────────
// This lane is reachable by anyone who guesses a URL, not only by Stripe.
// `req.text()` materialises the entire payload, so the length check must not be
// the only guard — otherwise an anonymous caller can make the process hold an
// arbitrarily large body before we ever look at its size.
describe("(m) an oversized body is refused before it is buffered", () => {
  it("answers 413 from the declared content-length and never reads the body", async () => {
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath(T1);
    let bodyRead = false;
    const fake = {
      method: "POST",
      url: `http://native.test${path}`,
      headers: new Headers({ "content-length": String(256 * 1024 + 1) }),
      text: async () => {
        bodyRead = true;
        return "{}";
      },
    } as unknown as Request;
    const res = await handleTenantInvoiceStripeWebhook(fake, { dataDir: dir });
    expect(res.status).toBe(413);
    expect(bodyRead).toBe(false);
    expect(paymentAudit(T1)).toHaveLength(0);
  });

  it("still refuses an oversized body when the header understates it", async () => {
    await connect(T1, KEY_A, WHSEC_A);
    const path = await webhookPath(T1);
    const big = "x".repeat(256 * 1024 + 10);
    const res = await postWebhook(path, big, sign(big, WHSEC_A));
    expect(res.status).toBe(413);
    expect(paymentAudit(T1)).toHaveLength(0);
  });
});
