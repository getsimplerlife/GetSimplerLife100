/**
 * slice-182-page-truth.test.tsx — four of the five slice-182 defects, each with
 * BOTH sides of the seam read at source before the fix.
 *
 *   1. THE INVOICE SHARE PAGE (owner-directed) — the server now serves an issued
 *      invoice whose email failed, so the customer-facing badge must read
 *      "Not delivered" (src/lib/invoice-status.ts). It rendered the raw enum
 *      value before this slice, which for `failed` was the word "failed".
 *   2. /portal/import read `im.tableId`, a field the server never sends (the
 *      target is nested: `ImportTarget { kind: "table"; tableId }`), so the page
 *      told the tenant their own table "has no fields" and the only bulk-map
 *      button could never render.
 *   3. The bell titled EVERY non-draft invoice "Invoice sent" — including
 *      `failed` ones, which is the normal state while the mail lane refuses
 *      every message.
 *   4. A 401 rendered /portal/import and /portal/bookings as an empty workspace.
 *   5. The booking share page printed "Booking confirmed" for a write outcome
 *      ("applied") that creates `status: "requested"`.
 *
 * Expected values are derived from the system of record (INVOICE_STATUSES,
 * INVOICE_STATUS_LABEL, the fixture's own target table) — never re-typed from
 * the component.
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import InvoiceSharePage from "../lazy/invoices.share.$slug.page";
import PortalImportIndexPage from "../lazy/portal.import.index.page";
import BookingsPage from "../lazy/portal.bookings.index.page";
import BookingSharePage from "../lazy/bookings.share.$slug.page";
import { INVOICE_STATUS_LABEL, invoiceStatusLabel } from "../lib/invoice-status";
import { INVOICE_STATUSES } from "../native/invoice/types";
import { quoteNotices } from "../lib/portal-notifications";

let currentSlug = "si_s182";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useParams: () => ({ slug: currentSlug }),
  useSearch: () => ({}),
}));

// ── method-aware fetch stub ─────────────────────────────────────────────────
interface Route {
  /** The URL must END with this path (query string ignored). */
  path?: string;
  /** …or START with this prefix (used to fail EVERY read at once). */
  prefix?: string;
  method?: "GET" | "POST" | "DELETE";
  status?: number;
  body: unknown;
}
function stubFetch(routes: Route[]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.split("?")[0] ?? "";
    const route = routes.find(
      (r) =>
        (!r.method || r.method === method) &&
        ((r.path !== undefined && path.endsWith(r.path)) || (r.prefix !== undefined && path.startsWith(r.prefix))),
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── 1. the customer-facing invoice badge on a FAILED invoice ────────────────
describe("slice 182 — the public invoice page's badge for a failed invoice", () => {
  function failedView() {
    return {
      invoiceNumber: "INV-1801",
      issuerName: "Northwind Advisory",
      billToName: "Acme",
      currency: "USD",
      lineItems: [{ description: "Discovery workshop", qty: 2, unitPriceCents: 125000, amountCents: 250000 }],
      amountDueCents: 250000,
      issuedAt: "2026-11-02T09:00:00.000Z",
      dueDate: "2026-12-02",
      status: "failed",
      hasPdf: true,
      pdfPath: "/api/native/invoice/share/si_s182/pdf",
      canPay: true,
      paymentStartedAt: null,
    };
  }

  it("reads the shared map's label for `failed` — never the raw enum, never 'Draft'", async () => {
    currentSlug = "si_s182";
    stubFetch([{ path: "/api/native/invoice/share/si_s182", body: { data: failedView() } }]);
    render(<InvoiceSharePage />);
    // Derived from the server's status enum + the shared label map.
    expect(await screen.findByText(INVOICE_STATUS_LABEL.failed)).toBeInTheDocument();
    expect(INVOICE_STATUS_LABEL.failed).not.toBe(INVOICE_STATUS_LABEL.draft);
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    // "Issued" is the word for `sent` only — a failed delivery must not wear it.
    expect(screen.queryByText("Issued")).not.toBeInTheDocument();
    // The invoice itself is still fully readable at the link.
    expect(screen.getByText("INV-1801", { exact: false })).toBeInTheDocument();
  });
});

// ── 2. /portal/import reads the nested target ───────────────────────────────
const TABLE = {
  id: "tbl_s182",
  name: "Client register",
  fields: [
    { key: "company", label: "Company" },
    { key: "contact_email", label: "Contact email" },
  ],
};
/** The job shape `publicJob()` serves: the target is NESTED, never `tableId`. */
const IMPORT_JOB = {
  id: "imp_s182",
  provider: "xero",
  sourceLabel: "Acme Books",
  status: "staged",
  createdAt: "2026-11-02T09:00:00.000Z",
  target: { kind: "table", tableId: TABLE.id },
  mapping: [],
};
const PREVIEW_ROWS = [{ company: "Acme", contact_email: "ap@acme.test" }];

function importRoutes() {
  return [
    { path: "/api/native/import/imp_s182/runs", body: { data: { runs: [] } } },
    {
      path: "/api/native/import/imp_s182/preview",
      method: "POST" as const,
      body: { data: { previewRows: PREVIEW_ROWS, staged: PREVIEW_ROWS.length } },
    },
    { path: "/api/native/import/lanes", body: { data: { lanes: [{ provider: "xero", wired: true }] } } },
    { path: "/api/native/tables", body: { data: { tables: [TABLE] } } },
    { path: "/api/native/import/writes", body: { data: { writes: [] } } },
    { path: "/api/native/import", body: { data: { imports: [IMPORT_JOB] } } },
  ];
}

describe("slice 182 — /portal/import renders the job's real target", () => {
  it("shows the target table's name and the bulk-map panel (pre-fix: 'the target table has no fields yet')", async () => {
    stubFetch(importRoutes());
    render(<PortalImportIndexPage />);
    // The target line resolves the NESTED `target.tableId` against the tenant's
    // own tables; pre-fix it fell through to the literal word "table".
    expect(await screen.findByText(new RegExp(`→\\s*${TABLE.name}`))).toBeInTheDocument();
    // The "no fields" lie is gone.
    expect(screen.queryByText(/target table has no fields yet/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Preview$/ }));
    // The bulk-map panel (and its only button) is reachable now.
    expect(await screen.findByText(/Map source fields \(bulk\)/i)).toBeInTheDocument();
    const sourceFieldCount = Object.keys(PREVIEW_ROWS[0] ?? {}).length;
    expect(await screen.findByRole("button", { name: new RegExp(`Map all ${sourceFieldCount} field`, "i") })).toBeInTheDocument();
    expect(screen.queryByText(/target table has no fields yet/i)).not.toBeInTheDocument();
  });

  it("a 401 is a sign-in state, not 'Import lanes (0 wired)' / 'No imports yet'", async () => {
    stubFetch([{ prefix: "/api/native/", status: 401, body: { error: "Unauthorized" } }]);
    render(<PortalImportIndexPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/sign in again/i);
    expect(screen.queryByText(/Import lanes \(/)).not.toBeInTheDocument();
    expect(screen.queryByText("No imports yet")).not.toBeInTheDocument();
  });
});

// ── 3. the bell never claims "Invoice sent" for a failed invoice ────────────
describe("slice 182 — the bell describes the invoice's real state", () => {
  const NOW = "2026-11-02T09:00:00.000Z";
  const base = { invoiceNumber: "INV-1802", amountDueCents: 250_000, currency: "USD", updatedAt: NOW };

  it("a failed invoice is an ERROR titled for delivery failure, labelled 'Not delivered'", () => {
    const [item] = quoteNotices([], [{ ...base, id: "inv-failed", status: "failed" }], []);
    expect(item.tone).toBe("error");
    expect(item.title).not.toBe("Invoice sent");
    // The label comes from the shared map, not from a second copy of the words.
    expect(item.message).toContain(invoiceStatusLabel("failed"));
  });

  it("every status the server can emit is described, and only `draft` stays silent", () => {
    for (const status of INVOICE_STATUSES) {
      const items = quoteNotices([], [{ ...base, id: `inv-${status}`, status }], []);
      expect(items.length, `status ${status}`).toBe(status === "draft" ? 0 : 1);
      if (items.length === 1) {
        expect(items[0].message).toContain(invoiceStatusLabel(status));
        expect(items[0].title.length).toBeGreaterThan(0);
      }
    }
    // A sent invoice keeps its honest title (the label's own word, any case).
    const [sent] = quoteNotices([], [{ ...base, id: "inv-sent", status: "sent" }], []);
    expect(sent.title.toLowerCase()).toContain(invoiceStatusLabel("sent").toLowerCase());
    expect(sent.tone).toBe("info");
    // A queued one says it is still going out.
    const [queued] = quoteNotices([], [{ ...base, id: "inv-queued", status: "queued" }], []);
    expect(queued.title.toLowerCase()).toContain(invoiceStatusLabel("queued").toLowerCase());
  });
});

// ── 4. /portal/bookings renders a 401 honestly ──────────────────────────────
describe("slice 182 — /portal/bookings renders a 401 honestly", () => {
  it("shows a sign-in notice instead of 'No booking pages yet' / 'Nothing pending.'", async () => {
    stubFetch([{ path: "/api/native/booking", status: 401, body: { error: "Unauthorized" } }]);
    render(<BookingsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toMatch(/sign in again/i);
    expect(screen.queryByText(/No booking pages yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing pending\./i)).not.toBeInTheDocument();
  });

  it("shows the server's message for a 500 (never an empty workspace)", async () => {
    stubFetch([
      { path: "/api/native/booking", status: 500, body: { error: "Booking store unavailable" } },
    ]);
    render(<BookingsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").toContain("Booking store unavailable");
    expect(screen.queryByText(/No booking pages yet/i)).not.toBeInTheDocument();
  });
});

// ── 5. the booking share page never claims a confirmation it did not get ────
describe("slice 182 — the booking share page prints the record's own status", () => {
  const PAGE = {
    name: "Intro call",
    description: "",
    timeZone: "UTC",
    slotDurationMinutes: 30,
    bufferMinutes: 0,
    availability: ["mon"],
    teamSize: 1,
    calendarSyncLabel: "Google Calendar: not connected",
  };
  const SLOT = "2026-12-07T09:00:00.000Z";

  async function submitRequest(reply: unknown) {
    currentSlug = "bk_s182";
    stubFetch([
      { path: "/api/native/booking/share/bk_s182/slots", body: { data: { slots: [SLOT] } } },
      { path: "/api/native/booking/share/bk_s182", method: "POST", body: reply },
      { path: "/api/native/booking/share/bk_s182", body: { data: PAGE } },
    ]);
    const { container } = render(<BookingSharePage />);
    // The page's labels are not associated with their inputs (no htmlFor/id), so
    // address the controls by type — the same way the browser does.
    const dateInput = await waitFor(() => {
      const el = container.querySelector('input[type="date"]');
      if (!el) throw new Error("date input not rendered yet");
      return el as HTMLInputElement;
    });
    fireEvent.change(dateInput, { target: { value: "2026-12-07" } });
    const slotButton = await screen.findByRole("button", { name: /09:00/ });
    fireEvent.click(slotButton);
    const [nameInput, emailInput] = screen.getAllByRole("textbox");
    fireEvent.change(nameInput!, { target: { value: "Ada Lovelace" } });
    fireEvent.change(emailInput!, { target: { value: "ada@acme.test" } });
    fireEvent.click(screen.getByRole("button", { name: /Request this time/i }));
  }

  it("`applied` + record status `requested` → a request, never 'Booking confirmed'", async () => {
    await submitRequest({ data: { status: "applied", bookingStatus: "requested" } });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
    const heading = screen.getByRole("heading", { level: 1 }).textContent ?? "";
    expect(heading).not.toMatch(/confirmed/i);
    expect(heading).toMatch(/request received/i);
    // The reserved claim is true for a `requested` record (availability counts it
    // as busy), so it may appear — but only alongside "request".
    expect(heading).toMatch(/reserved/i);
  });

  it("a merely PENDING write holds no time and promises no reservation", async () => {
    await submitRequest({ data: { status: "pending", bookingStatus: null } });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
    const heading = screen.getByRole("heading", { level: 1 }).textContent ?? "";
    expect(heading).not.toMatch(/confirmed/i);
    expect(heading).not.toMatch(/reserved/i);
    expect(heading).toMatch(/request received/i);
  });

  it("a genuinely CONFIRMED record does say confirmed", async () => {
    await submitRequest({ data: { status: "applied", bookingStatus: "confirmed" } });
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent ?? "").toMatch(/Booking confirmed/i),
    );
  });
});
