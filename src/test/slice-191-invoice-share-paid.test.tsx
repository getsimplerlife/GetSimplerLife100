/**
 * slice-191-invoice-share-paid.test.tsx — the invoice share page can no longer
 * take a second payment, and `?checkout=return` must be corroborated.
 *
 * THE DEFECT (both sides read before the fix):
 *   - `src/native/invoice/router.ts` `publicInvoiceView` sent `paid`, `paidAt`
 *     and `amountPaidCents`, but the page's `InvoiceView` declared none of them,
 *     so a PAID invoice still rendered `Total due: USD X` and a live
 *     `Pay USD X` button;
 *   - the `pay` branch of the share handler never looked at `invoice.payment`
 *     before calling `createTenantCheckoutSession`, which charges
 *     `invoice.amountDueCents` in full — so a customer who had already paid
 *     could pay again, in full, on the tenant's own Stripe;
 *   - `checkoutState === "return"` alone printed "your payment was submitted to
 *     …" for a flag anyone can append to a URL.
 *
 * No assertion here re-types a value the code supplies: the paid date is
 * formatted by the same `Date` call the page uses, the refusal statuses are the
 * server's own, and "no session was created" is asserted at the only call that
 * can create one (`api.stripe.com/v1/checkout/sessions`).
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import InvoiceSharePage from "../lazy/invoices.share.$slug.page";
import {
  handleNativeInvoicesAuthed,
  handleNativeInvoiceShare,
  isInvoicePayable,
  publicInvoiceView,
} from "../native/invoice/router";
import { getInvoice, insertInvoice, registerInvoiceSlug } from "../native/invoice/store";
import type { InvoiceRecord } from "../native/invoice/types";

// ── the page's router surface ───────────────────────────────────────────────
let currentSlug = "si_s191";
let currentSearch: { checkout?: string } = {};

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useParams: () => ({ slug: currentSlug }),
  useSearch: () => currentSearch,
}));

interface Route {
  path?: string;
  method?: "GET" | "POST";
  status?: number;
  body: unknown;
}
function stubFetch(routes: Route[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.split("?")[0] ?? "";
    const route = routes.find(
      (r) => (!r.method || r.method === method) && (r.path === undefined || path.endsWith(r.path)),
    );
    const status = route ? (route.status ?? 200) : 404;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => (route ? route.body : { error: "not mocked" }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const T1 = "tenant-a@acme.test";
/** A shape-valid Stripe test-mode secret key (fake; never a real credential). */
const KEY_A = "sk_test_tenantA0000000000000000001";
const PAID_AT = "2026-11-01T12:00:00.000Z";
const AMOUNT = 250_000;

/** A page view of an invoice the tenant's own Stripe account has been paid for. */
function paidView(overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber: "INV-1901",
    issuerName: "Northwind Advisory",
    billToName: "Acme",
    currency: "USD",
    lineItems: [{ description: "Discovery workshop", qty: 1, unitPriceCents: AMOUNT, amountCents: AMOUNT }],
    amountDueCents: AMOUNT,
    issuedAt: "2026-10-02T09:00:00.000Z",
    issuedAtSource: "sent",
    dueDate: "2026-11-01",
    status: "sent",
    hasPdf: true,
    pdfPath: "/api/native/invoice/share/si_s191/pdf",
    canPay: false,
    paymentStartedAt: null,
    paid: true,
    paidAt: PAID_AT,
    amountPaidCents: AMOUNT,
    ...overrides,
  };
}

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  currentSearch = {};
  currentSlug = "si_s191";
});

// ── 1. the paid page is a receipt ───────────────────────────────────────────
describe("slice 191 — a PAID invoice reads as a receipt, with no way to pay again", () => {
  it("shows Paid, the amount paid and the date — and NO 'Total due', NO Pay button", async () => {
    currentSlug = "si_s191";
    currentSearch = {};
    stubFetch([{ path: "/api/native/invoice/share/si_s191", body: { data: paidView() } }]);
    const { container } = render(<InvoiceSharePage />);

    // The badge and the receipt's own facts.
    expect(await screen.findByText("Paid")).toBeInTheDocument();
    // The receipt sentence: amount paid + who was paid. Read off the rendered
    // text because the line-item table also prints the same amount.
    const text = container.textContent ?? "";
    expect(text).toContain(`Invoice INV-1901 — ${money(AMOUNT, "USD")} paid to Northwind Advisory`);
    // The date is formatted by the page's own formatter, not re-typed here.
    expect(text).toContain(new Date(PAID_AT).toLocaleDateString());
    // It still identifies the invoice — a receipt, not an empty page.
    expect(text).toContain("INV-1901");

    // THE DEFECT: a paid invoice offered a full-price payment.
    expect(screen.queryByText(/Total due/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/Total due/i);
    // The PDF download is unaffected.
    expect(screen.getByText(/Download PDF/i)).toBeInTheDocument();
  });

  it("an UNPAID, connected invoice still offers the real Pay button (this slice must not break paying)", async () => {
    currentSlug = "si_s191b";
    currentSearch = {};
    stubFetch([
      {
        path: "/api/native/invoice/share/si_s191b",
        body: { data: paidView({ paid: false, paidAt: null, amountPaidCents: null, canPay: true }) },
      },
    ]);
    render(<InvoiceSharePage />);
    expect(await screen.findByRole("button", { name: new RegExp(`Pay ${money(AMOUNT, "USD")}`) })).toBeInTheDocument();
    expect(screen.getByText(/Total due/i)).toBeInTheDocument();
    expect(screen.queryByText("Paid")).not.toBeInTheDocument();
  });
});

// ── 4 & 5. ?checkout=return must be corroborated ────────────────────────────
describe("slice 191 — '?checkout=return' is corroborated by the server's record", () => {
  const SENTENCE = /your payment was submitted to/i;

  it("the flag ALONE prints no submission claim — it says this page has no record", async () => {
    currentSlug = "si_s191c";
    currentSearch = { checkout: "return" };
    stubFetch([
      {
        path: "/api/native/invoice/share/si_s191c",
        body: { data: paidView({ paid: false, paidAt: null, amountPaidCents: null, canPay: true, paymentStartedAt: null }) },
      },
    ]);
    render(<InvoiceSharePage />);
    expect(await screen.findByText(/no record that a payment was started/i)).toBeInTheDocument();
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
  });

  it("the flag WITH the server's paymentStartedAt does print it", async () => {
    currentSlug = "si_s191d";
    currentSearch = { checkout: "return" };
    stubFetch([
      {
        path: "/api/native/invoice/share/si_s191d",
        body: {
          data: paidView({
            paid: false,
            paidAt: null,
            amountPaidCents: null,
            canPay: true,
            paymentStartedAt: "2026-11-02T10:00:00.000Z",
          }),
        },
      },
    ]);
    render(<InvoiceSharePage />);
    expect(await screen.findByText(SENTENCE)).toBeInTheDocument();
    expect(screen.queryByText(/no record that a payment was started/i)).not.toBeInTheDocument();
  });
});

// ── 2, 3 & 6. the server lane ───────────────────────────────────────────────
describe("slice 191 — the server refuses a second checkout and never mints one", () => {
  let dir: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  const savedEnv: Record<string, string | undefined> = {};
  let seq = 0;

  function sessionResponse(url = "https://checkout.stripe.com/c/pay/cs_test_s191"): Response {
    return new Response(JSON.stringify({ id: "cs_test_s191", url }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  function seed(tenantId: string, slug: string, extra: Partial<InvoiceRecord> = {}): InvoiceRecord {
    seq += 1;
    const now = new Date().toISOString();
    const record: InvoiceRecord = {
      id: `inv_s191${String(seq).padStart(4, "0")}`,
      tenantId,
      invoiceNumber: "INV-1901",
      linkedDealRoomId: "dea_s191room0001",
      currency: "USD",
      lineItems: [{ id: "li_1", description: "Discovery workshop", qty: 1, unitPriceCents: AMOUNT }],
      amountDueCents: AMOUNT,
      status: "sent",
      docId: null,
      customerEmail: "client@acme.test",
      dueDate: "2026-11-01",
      shareSlug: slug,
      lastAttempt: null,
      version: 2,
      createdAt: "2026-10-02T09:00:00.000Z",
      createdBy: tenantId,
      updatedAt: now,
      updatedBy: tenantId,
      sentAt: "2026-10-03T09:00:00.000Z",
      sentBy: tenantId,
      ...extra,
    };
    insertInvoice(dir, record);
    registerInvoiceSlug(dir, slug, tenantId);
    return record;
  }

  const PAID: Partial<InvoiceRecord> = {
    payment: {
      paidAt: PAID_AT,
      amountCents: AMOUNT,
      currency: "USD",
      sessionId: "cs_test_paid0001",
      eventId: "evt_test_paid0001",
    },
  };

  const payUrl = (slug: string) => `http://native.test/api/native/invoice/share/${slug}/pay`;
  const postPay = (slug: string) =>
    handleNativeInvoiceShare(new Request(payUrl(slug), { method: "POST" }), { dataDir: dir });
  const getShare = (slug: string) =>
    handleNativeInvoiceShare(new Request(`http://native.test/api/native/invoice/share/${slug}`, { method: "GET" }), {
      dataDir: dir,
    });
  const connect = () =>
    handleNativeInvoicesAuthed(
      new Request("http://native.test/api/native/invoice/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secretKey: KEY_A }),
      }),
      { userEmail: T1, dataDir: dir },
    );

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "invoice-paid-191-"));
    savedEnv.INTEGRATION_ENCRYPTION_KEY = process.env.INTEGRATION_ENCRYPTION_KEY;
    process.env.INTEGRATION_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    process.env.INTEGRATION_ENCRYPTION_KEY = savedEnv.INTEGRATION_ENCRYPTION_KEY;
    rmSync(dir, { recursive: true, force: true });
  });

  it("POST …/pay on a PAID invoice → 409 in words, and NO Checkout Session is created", async () => {
    const seeded = seed(T1, "si_paid0191", PAID);
    expect((await connect()).status).toBe(200);

    const res = await postPay("si_paid0191");
    expect(res.status).toBe(409);
    const body = await res.json();
    // Actionable: what happened, when, and that nothing was charged now.
    expect(body.error).toMatch(/already paid/i);
    expect(body.error).toMatch(/nothing has been charged/i);
    expect(body.error).toContain(new Date(PAID_AT).toLocaleDateString());
    expect(body).not.toHaveProperty("data.checkoutUrl");

    // THE ASSERTION THAT MATTERS: a 409 that still minted a session is the bug.
    // `api.stripe.com/v1/checkout/sessions` is the only call that can create one.
    expect(fetchMock).not.toHaveBeenCalled();
    const after = getInvoice(dir, T1, seeded.id)!;
    expect(after.lastCheckoutSessionId).toBeUndefined();
    expect(after.paymentStartedAt).toBeUndefined();
    // The confirmed payment is untouched.
    expect(after.payment?.paidAt).toBe(PAID_AT);
  });

  it("the same invoice reports canPay=false on the page lane (one predicate, both lanes)", async () => {
    seed(T1, "si_paid0192", PAID);
    expect((await connect()).status).toBe(200);
    const view = (await (await getShare("si_paid0192")).json()).data;
    expect(view.paid).toBe(true);
    expect(view.paidAt).toBe(PAID_AT);
    expect(view.amountPaidCents).toBe(AMOUNT);
    expect(view.canPay).toBe(false);
  });

  it("an UNPAID invoice with Stripe connected still creates a session (positive control)", async () => {
    seed(T1, "si_unpaid0193");
    expect((await connect()).status).toBe(200);
    fetchMock.mockResolvedValueOnce(sessionResponse());

    const res = await postPay("si_unpaid0193");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_s191");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as [string, any])[0])).toContain("/v1/checkout/sessions");
  });

  it("isInvoicePayable is false for a paid record, and the view's canPay agrees — same record, both read", async () => {
    const seeded = seed(T1, "si_paid0194", PAID);
    expect((await connect()).status).toBe(200);
    const record = getInvoice(dir, T1, seeded.id)!;
    const ctx = { dataDir: dir, tenantId: T1 };

    expect(isInvoicePayable(record, ctx)).toBe(false);
    const view = publicInvoiceView(record, "Acme", "Northwind Advisory", ctx) as { canPay: boolean; paid: boolean };
    expect(view.canPay).toBe(false);
    expect(view.paid).toBe(true);

    // The complement: the same record with the payment removed is payable, so
    // the predicate is not simply always false.
    const unpaid: InvoiceRecord = { ...record };
    delete unpaid.payment;
    expect(isInvoicePayable(unpaid, ctx)).toBe(true);
    expect((publicInvoiceView(unpaid, "Acme", "Northwind Advisory", ctx) as { canPay: boolean }).canPay).toBe(true);
  });

  it("a paid invoice whose tenant never connected Stripe is still refused with 409 and no provider call", async () => {
    seed(T1, "si_paid0195", PAID);
    const res = await postPay("si_paid0195");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already paid/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
