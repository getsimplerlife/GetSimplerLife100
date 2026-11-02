/**
 * slice-182-invoice-share.test.ts — the invoice share link serves an ISSUED
 * invoice even when its delivery failed.
 *
 * THE DEFECT (both sides read before the fix):
 *   - page/served lane: `src/native/invoice/router.ts` rejected every status but
 *     `sent` on the public lane, and said so in its own doc comment ("an invoice
 *     that is NOT \"sent\" → 404 (a draft or a failed delivery is never
 *     public)");
 *   - writer: `src/native/invoice/delivery.ts` only ever returns `sent` when the
 *     mail provider ACKNOWLEDGES the message, and Brevo refuses every message
 *     today — so in practice every invoice lands `failed` and its own share link
 *     404s. The tenant could not even paste the link into their own mailbox.
 *
 * WHAT THE SLUG QUESTION TURNED OUT TO BE: the slug is minted BEFORE the
 * outbound attempt (`gate.ts` applySend step 2 mints + registers it and writes
 * the durable `queued` intent; the email is step 3). A `failed` invoice
 * therefore already carries a registered `si_…` slug — the 404 was purely the
 * status check, not a missing slug.
 *
 * No assertion here re-types a value the code supplies: the served/refused
 * expectation is derived from the router's own `PUBLIC_INVOICE_STATUS` map over
 * the server's own `INVOICE_STATUSES` list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInvoice, insertInvoice, registerInvoiceSlug, unregisterInvoiceSlug } from "../native/invoice/store";
import * as invoiceRouter from "../native/invoice/router";
import { INVOICE_STATUSES, type InvoiceRecord, type InvoiceStatus } from "../native/invoice/types";

const { handleNativeInvoicesAuthed, handleNativeInvoiceShare } = invoiceRouter;
/**
 * The router's own served/refused map. Read through a namespace + a guard so
 * this file also RUNS (and fails for the right reason) on the pre-fix source,
 * where `PUBLIC_INVOICE_STATUS` does not exist yet: an import that cannot
 * resolve would abort the whole file instead of showing which behaviour broke.
 */
const PUBLIC_INVOICE_STATUS: Partial<Record<InvoiceStatus, boolean>> =
  (invoiceRouter as unknown as { PUBLIC_INVOICE_STATUS?: Partial<Record<InvoiceStatus, boolean>> }).PUBLIC_INVOICE_STATUS ?? {};

/** The router's decision for a status — a missing decision is a failure. */
function isServed(status: InvoiceStatus): boolean {
  const decision = PUBLIC_INVOICE_STATUS[status];
  if (typeof decision !== "boolean") throw new Error(`no public-share decision recorded for status "${status}"`);
  return decision;
}

const T1 = "tenant-a@acme.test";
/** A shape-valid Stripe test-mode secret key (fake; never a real credential). */
const KEY_A = "sk_test_tenantA0000000000000000001";

let dir: string;
let fetchMock: ReturnType<typeof vi.fn>;
const savedEnv: Record<string, string | undefined> = {};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function sessionResponse(url = "https://checkout.stripe.com/c/pay/cs_test_slice182"): Response {
  return jsonResponse(200, { id: "cs_test_slice182", url });
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

let seq = 0;
/** Seed an invoice in ANY status, carrying the slug the send path mints. */
function seedInvoice(
  status: InvoiceStatus,
  slug: string,
  opts: { withSlug?: boolean; amountDueCents?: number } = {},
): InvoiceRecord {
  const now = new Date().toISOString();
  seq += 1;
  const record: InvoiceRecord = {
    id: `inv_s182_${String(seq).padStart(4, "0")}`,
    tenantId: T1,
    invoiceNumber: `INV-18${String(seq).padStart(2, "0")}`,
    linkedDealRoomId: "dea_s182_room",
    currency: "USD",
    lineItems: [{ id: "li_1", description: "Discovery workshop", qty: 2, unitPriceCents: opts.amountDueCents ?? 125000 }],
    amountDueCents: (opts.amountDueCents ?? 125000) * 2,
    status,
    docId: null,
    customerEmail: "client@acme.test",
    dueDate: "2026-12-02",
    shareSlug: opts.withSlug === false ? null : slug,
    lastAttempt:
      status === "failed"
        ? {
            at: now,
            by: T1,
            channel: "smtp",
            outcome: "failed",
            error: "Sending has been rejected because the sender you used is not valid",
          }
        : null,
    version: 2,
    createdAt: now,
    createdBy: T1,
    updatedAt: now,
    updatedBy: T1,
    ...(status === "sent" ? { sentAt: now, sentBy: T1 } : {}),
  };
  insertInvoice(dir, record);
  if (record.shareSlug) registerInvoiceSlug(dir, record.shareSlug, T1);
  return record;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "invoice-share-182-"));
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

describe("slice 182 — a FAILED invoice is served at its own share link", () => {
  it("GET on a failed invoice's slug → 200, and it is the failed invoice (pre-fix: 404)", async () => {
    const inv = seedInvoice("failed", "si_failed0001");
    const res = await publicLane("GET", "/api/native/invoice/share/si_failed0001");
    expect(res.status).toBe(200);
    const body = await res.json();
    // The status the record carries, not a friendlier one: the page derives its
    // badge from this (src/lib/invoice-status.ts).
    expect(body.data.status).toBe(inv.status);
    expect(body.data.invoiceNumber).toBe(inv.invoiceNumber);
    expect(body.data.amountDueCents).toBe(inv.amountDueCents);
    // The public view still carries no internal ids.
    expect(body.data).not.toHaveProperty("id");
    expect(body.data).not.toHaveProperty("docId");
    expect(body.data).not.toHaveProperty("linkedDealRoomId");
    expect(JSON.stringify(body)).not.toContain(inv.id);
  });

  it("the PAY lane is reachable from a failed invoice's link (tenant's own Stripe)", async () => {
    const inv = seedInvoice("failed", "si_failed0002");
    const connect = await authed("POST", "/api/native/invoice/stripe", { secretKey: KEY_A });
    expect(connect.status).toBe(200);
    fetchMock.mockResolvedValueOnce(sessionResponse());

    const res = await publicLane("POST", "/api/native/invoice/share/si_failed0002/pay");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_slice182");
    // The session was created with the invoice's OWN server-side amount.
    const form = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, any])[1].body));
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe(String(inv.amountDueCents));
    // Opening a checkout page is not money: only the "started" stamp is written.
    const after = getInvoice(dir, T1, inv.id);
    expect(after?.paymentStartedAt).toBeTruthy();
    expect(after?.payment).toBeUndefined();
  });

  it("a DRAFT invoice is still 404 — nothing was issued", async () => {
    seedInvoice("draft", "si_draft0001", { withSlug: false });
    expect((await publicLane("GET", "/api/native/invoice/share/si_draft0001")).status).toBe(404);
  });

  it("a revoked link on a failed invoice is still dead (the slug stays the boundary)", async () => {
    seedInvoice("failed", "si_revoked0001");
    // Revoking unregisters the slug (slice 152) — the record keeps `failed`, and
    // the public lane must refuse it anyway: the slug, not the status, is the
    // credential.
    unregisterInvoiceSlug(dir, "si_revoked0001");
    expect((await publicLane("GET", "/api/native/invoice/share/si_revoked0001")).status).toBe(404);
    expect((await publicLane("POST", "/api/native/invoice/share/si_revoked0001/pay")).status).toBe(404);
    // Zero outbound calls: a dead link can never start a payment.
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("an unknown slug is 404 whatever the record says", async () => {
    seedInvoice("failed", "si_known0001");
    expect((await publicLane("GET", "/api/native/invoice/share/si_unknown0001")).status).toBe(404);
  });
});

describe("slice 182 — the served/refused rule is the router's own map, over the server's own status list", () => {
  it("every INVOICE_STATUSES value resolves exactly as PUBLIC_INVOICE_STATUS says", async () => {
    // Structural: this fails the day a status is added without a decision, and
    // it derives both sides from the source of truth rather than re-typing them.
    expect(INVOICE_STATUSES.length).toBeGreaterThanOrEqual(4);
    for (const status of INVOICE_STATUSES) {
      const slug = `si_rule${status}0001`;
      seedInvoice(status, slug);
      const res = await publicLane("GET", `/api/native/invoice/share/${slug}`);
      expect(res.status, `status ${status}`).toBe(isServed(status) ? 200 : 404);
      if (isServed(status)) {
        expect((await res.json()).data.status).toBe(status);
      }
    }
  });

  it("only `draft` is private (the one state that was never issued)", () => {
    const privateStates = INVOICE_STATUSES.filter((s) => !isServed(s));
    expect(privateStates).toEqual(["draft"]);
  });

  it("`queued` is served — it is the same issued record mid-dispatch, badge says Sending", async () => {
    seedInvoice("queued", "si_queued0001");
    const res = await publicLane("GET", "/api/native/invoice/share/si_queued0001");
    expect(res.status).toBe(200);
    expect((await res.json()).data.status).toBe("queued");
  });
});
