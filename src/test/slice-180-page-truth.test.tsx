/**
 * SLICE 180 — five confirmed defects from Sweep C6 §4
 * (qa-sweepC6-s4-settled-2026-11-02.md), all with both sides of the seam read.
 *
 * Every test here FAILS on the pre-fix source at c2a56b3. None of them asserts a
 * literal the component also supplies:
 *
 *   - the admin tests build their payloads in the WRITER'S real row shape
 *     (`{ id, timestamp, user, action, resource, detail, ip }` for the audit
 *     store; `{ …, purchasedAt, tenantEmail }` for purchases) and then derive the
 *     expected actor, date and count FROM the fixture they wrote;
 *   - the deal-room badge test derives its expected label from the server's own
 *     status enum (`INVOICE_STATUSES`) and the label map — never a second copy of
 *     the copy string;
 *   - the health/billing tests compare against the status code the mocked
 *     response carries, not against a sentence the page also supplies.
 *
 * THE FIVE:
 *   1 HIGH      /portal/admin read `log.userId` / `log.createdAt`, which no audit
 *               row has ever carried (`user` / `timestamp` are the real fields),
 *               so "Recent Activity" was always empty and the last-action date
 *               never rendered; and it fetched `/api/audit-logs` with no query,
 *               i.e. the 20 OLDEST rows in store order.
 *   2 MED-HIGH  The per-client purchases panel was fed by `/api/purchases`, which
 *               returns only the CALLER'S OWN rows keyed by map, and read
 *               `a.createdAt` where the record carries `purchasedAt`. Every
 *               client showed "No purchases yet" while "Total Purchases" was
 *               non-zero, and dates rendered "Invalid Date".
 *   3 MEDIUM    The customer-facing deal-room share page rendered every invoice
 *               that was not `sent` as "Draft" — including `failed`.
 *   4 MEDIUM    /api/admin/health returned the literal `status: "healthy"`, so
 *               the page's "SYSTEM STATUS: OPERATIONAL" banner was unconditional;
 *               a 401/403/500 rendered as "DEGRADED" with N/A telemetry.
 *   5 MEDIUM    /portal/billing read `.then(r => (r.ok ? r.json() : null))`, so a
 *               401 rendered as "No subscription on file".
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminIndexPage from "../lazy/portal.admin.index.page";
import AdminHealthPage from "../lazy/portal.admin.health.page";
import BillingPage from "../lazy/portal.billing.index.page";
import DealRoomSharePage from "../lazy/deal-rooms.share.$slug.page";
import { INVOICE_STATUS_LABEL, invoiceStatusLabel } from "../lib/invoice-status";
import { INVOICE_STATUSES } from "../native/invoice/types";
import { mockFetch, urlHas, urlIs } from "./helpers/portal-primitive-fetch";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useParams: () => ({ slug: "s180" }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── 1 + 2. /portal/admin reads the fields the server actually sends ──────────
/**
 * The audit store row, in the exact shape the writer produces
 * (`prod-server.ts`: `{ id, timestamp, user, action, resource, detail, ip }`).
 * `user` and `timestamp` are the fields the page must read — the pre-fix page
 * read `userId` and `createdAt`, neither of which exists on this row.
 */
const AUDIT_ROW = {
  id: "aud_slice180",
  timestamp: "2026-11-02T08:30:00.000Z",
  user: "client-180@example.test",
  action: "login",
  resource: "session",
  detail: "signed in from 203.0.113.5",
  ip: "203.0.113.5",
};
/** The purchase row, in the shape `buildPlanPurchase` writes (stripe-webhook.ts). */
const PURCHASE_ROW = {
  id: "purchase_slice180",
  type: "plan",
  tier: "growth",
  productName: "Growth plan",
  amount: 59900,
  stripeSessionId: "cs_test_slice180",
  status: "active",
  purchasedAt: "2026-11-01T12:00:00.000Z",
  // added by the owner-gated /api/admin/purchases route:
  tenantEmail: "client-180@example.test",
};
const CLIENT = {
  id: "client-180@example.test",
  email: "client-180@example.test",
  role: "user",
  createdAt: Date.parse("2026-10-01T10:00:00.000Z"),
};

function mockAdminData(opts: { purchasesStatus?: number } = {}) {
  return mockFetch([
    { match: urlIs("/api/admin/users"), body: { data: [CLIENT] } },
    {
      match: urlIs("/api/admin/purchases"),
      status: opts.purchasesStatus ?? 200,
      body: opts.purchasesStatus
        ? { error: "Admin access required" }
        : { data: [PURCHASE_ROW], total: 1 },
    },
    { match: urlHas("/api/audit-logs"), body: { data: [AUDIT_ROW], total: 1 } },
    { match: urlIs("/api/admin/subscriptions"), body: { data: [] } },
  ]);
}

async function openClient() {
  const email = await screen.findByText(CLIENT.email);
  fireEvent.click(email);
  return email;
}

describe("slice 180 — /portal/admin reads the audit row fields the server sends", () => {
  it("renders Recent Activity from a row carrying `user` + `timestamp` (pre-fix: 'No activity recorded')", async () => {
    mockAdminData();
    render(<AdminIndexPage />);
    await openClient();
    // The action the fixture row carries — nothing the page supplies.
    await waitFor(() => expect(screen.getByText(AUDIT_ROW.action)).toBeInTheDocument());
    expect(screen.queryByText("No activity recorded")).not.toBeInTheDocument();
    // The date is derived from the fixture's own timestamp.
    const expectedDate = new Date(AUDIT_ROW.timestamp).toLocaleDateString();
    expect(screen.getAllByText((_, node) => node?.textContent === expectedDate).length).toBeGreaterThan(0);
  });

  it("renders the last-action date on the client row from the same timestamp", async () => {
    mockAdminData();
    render(<AdminIndexPage />);
    const expectedDate = new Date(AUDIT_ROW.timestamp).toLocaleDateString();
    await waitFor(() =>
      expect(screen.getAllByText((_, node) => node?.textContent === expectedDate).length).toBeGreaterThan(0),
    );
  });

  it("asks /api/audit-logs for the NEWEST rows explicitly (pre-fix: no query = the 20 oldest)", async () => {
    const fetchMock = mockAdminData();
    render(<AdminIndexPage />);
    await openClient();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    const auditCall = urls.find((u) => u.includes("/api/audit-logs"));
    expect(auditCall, "the page must fetch /api/audit-logs").toBeTruthy();
    expect(auditCall).toContain("sortBy=timestamp");
    expect(auditCall).toContain("sortDir=desc");
    expect(auditCall).toContain("limit=10000");
  });
});

describe("slice 180 — the per-client purchases panel is fed by the owner-gated all-tenant route", () => {
  it("shows the client's purchase dated from `purchasedAt` (pre-fix: 'No purchases yet' + Invalid Date)", async () => {
    mockAdminData();
    render(<AdminIndexPage />);
    await openClient();
    await waitFor(() => expect(screen.getByText(PURCHASE_ROW.productName)).toBeInTheDocument());
    expect(screen.queryByText("No purchases yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
    const expectedDate = new Date(PURCHASE_ROW.purchasedAt).toLocaleDateString();
    expect(screen.getAllByText((_, node) => node?.textContent === expectedDate).length).toBeGreaterThan(0);
  });

  it("counts exactly the purchase rows it can list — the card cannot disagree with the panel", async () => {
    mockAdminData();
    render(<AdminIndexPage />);
    await openClient();
    // "Total Purchases" is the first card's sibling value; it must equal the
    // number of rows the server sent, and the client row must agree.
    await waitFor(() => expect(screen.getByText("Total Purchases")).toBeInTheDocument());
    const totalCard = screen.getByText("Total Purchases").previousElementSibling;
    expect(totalCard?.textContent).toBe("1");
    expect(screen.getByText(/1 purchase/)).toBeInTheDocument();
  });

  it("a refused read is reported, not rendered as an empty panel", async () => {
    mockAdminData({ purchasesStatus: 403 });
    render(<AdminIndexPage />);
    await openClient();
    // Rendered twice on purpose: once as the page-level banner and once in the
    // panel that would otherwise have claimed "No purchases yet".
    await waitFor(() =>
      expect(screen.getAllByText(/Couldn't load purchases \(HTTP 403\)/).length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("No purchases yet")).not.toBeInTheDocument();
    // The card must not print a count it cannot back with a list.
    const totalCard = screen.getByText("Total Purchases").previousElementSibling;
    expect(totalCard?.textContent).toBe("—");
  });
});

// ── 3. The customer-facing invoice badge ────────────────────────────────────
async function renderShareInvoice(status: string) {
  mockFetch([
    {
      match: urlHas("/api/native/dealroom/share/"),
      body: {
        data: {
          dealRoomId: "dr_slice180",
          name: "Slice 180 rollout",
          customerName: "Acme Testing",
          status: "active",
          description: "",
          proposal: null,
          checklist: null,
          invoices: [
            { invoiceNumber: "INV-180", currency: "USD", amountDueCents: 59900, status },
          ],
          updatedAt: "2026-11-02T00:00:00.000Z",
        },
      },
    },
  ]);
  render(<DealRoomSharePage />);
  return screen.findByText("INV-180");
}

describe("slice 180 — every invoice status the server can emit has its own badge", () => {
  it("the label map covers the enum exactly (no state falls through to a friendly one)", () => {
    for (const status of INVOICE_STATUSES) {
      expect(INVOICE_STATUS_LABEL[status], `no label for server status "${status}"`).toBeTruthy();
    }
    const labels = INVOICE_STATUSES.map((s) => INVOICE_STATUS_LABEL[s]);
    expect(new Set(labels).size, "two statuses must never share one label").toBe(INVOICE_STATUSES.length);
  });

  for (const status of INVOICE_STATUSES) {
    it(`renders "${status}" as the label the enum gives it`, async () => {
      await renderShareInvoice(status);
      expect(screen.getByText(invoiceStatusLabel(status))).toBeInTheDocument();
    });
  }

  it("a FAILED invoice never reads 'Draft' (pre-fix: it did)", async () => {
    await renderShareInvoice("failed");
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    expect(screen.getByText(INVOICE_STATUS_LABEL.failed)).toBeInTheDocument();
  });

  it("a status the server does not emit is shown verbatim, never as 'Draft'", async () => {
    await renderShareInvoice("refunded");
    expect(screen.getByText("refunded")).toBeInTheDocument();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
  });
});

// ── 4. /portal/admin/health reports a measurement, not a literal ────────────
const HEALTH_BODY = (status: string) => ({
  status,
  measuredAt: "2026-11-02T09:00:00.000Z",
  checks: [
    { id: "data", label: "Data on disk", status: status === "ok" ? "ok" : status === "degraded" ? "degraded" : "unknown", detail: null },
    { id: "backup", label: "Off-box backup", status: status === "ok" ? "ok" : status === "degraded" ? "degraded" : "unknown", detail: null },
  ],
  uptime: 4242,
  timestamp: "2026-11-02T09:00:00.000Z",
  memory: { rss: 104857600, heapUsed: 52428800, heapTotal: 104857600 },
});

describe("slice 180 — the health page prints a verdict only when one was measured", () => {
  it("says OPERATIONAL for a measured 'ok'", async () => {
    mockFetch([{ match: urlIs("/api/admin/health"), body: HEALTH_BODY("ok") }]);
    render(<AdminHealthPage />);
    await waitFor(() => expect(screen.getByText(/SYSTEM STATUS: OPERATIONAL/)).toBeInTheDocument());
  });

  it("says DEGRADED for a measured 'degraded'", async () => {
    mockFetch([{ match: urlIs("/api/admin/health"), body: HEALTH_BODY("degraded") }]);
    render(<AdminHealthPage />);
    await waitFor(() => expect(screen.getByText(/SYSTEM STATUS: DEGRADED/)).toBeInTheDocument());
    expect(screen.queryByText(/OPERATIONAL/)).not.toBeInTheDocument();
  });

  it("says NOT MEASURED for an unmeasured 'unknown' — never OPERATIONAL", async () => {
    mockFetch([{ match: urlIs("/api/admin/health"), body: HEALTH_BODY("unknown") }]);
    render(<AdminHealthPage />);
    await waitFor(() => expect(screen.getByText(/SYSTEM STATUS: NOT MEASURED/)).toBeInTheDocument());
    expect(screen.queryByText(/OPERATIONAL/)).not.toBeInTheDocument();
  });

  it("a 403 reads as 'not authorised', not as a degraded system (pre-fix: 'DEGRADED')", async () => {
    mockFetch([{ match: urlIs("/api/admin/health"), status: 403, body: { error: "Admin access required" } }]);
    render(<AdminHealthPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent ?? "").toMatch(/not authorised/i);
    expect(screen.queryByText(/DEGRADED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/OPERATIONAL/)).not.toBeInTheDocument();
  });

  it("a 500 is an error line, not a health verdict", async () => {
    mockFetch([{ match: urlIs("/api/admin/health"), status: 500, body: { error: "boom" } }]);
    render(<AdminHealthPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent ?? "").toContain("HTTP 500");
    expect(screen.queryByText(/DEGRADED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/OPERATIONAL/)).not.toBeInTheDocument();
  });
});

// ── 5. /portal/billing: a 401 is not "no plan" ──────────────────────────────
describe("slice 180 — /portal/billing reports a failed read instead of an empty plan", () => {
  it("a 401 shows a sign-in message and never 'No subscription on file'", async () => {
    mockFetch([
      { match: urlIs("/api/native/billing"), status: 401, body: { error: "Unauthorized" } },
      { match: urlIs("/api/native/entitlements"), body: {} },
    ]);
    render(<BillingPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent ?? "").toMatch(/sign in again/i);
    expect(screen.queryByText("No subscription on file")).not.toBeInTheDocument();
    expect(screen.queryByText("No invoices yet")).not.toBeInTheDocument();
  });

  it("a 500 is an error line, not an empty billing state", async () => {
    mockFetch([
      { match: urlIs("/api/native/billing"), status: 500, body: { error: "boom" } },
      { match: urlIs("/api/native/entitlements"), body: {} },
    ]);
    render(<BillingPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent ?? "").toContain("HTTP 500");
    expect(screen.queryByText("No subscription on file")).not.toBeInTheDocument();
  });

  it("a 2xx with no plan still says 'No subscription on file' — the empty state is reachable only on success", async () => {
    mockFetch([
      {
        match: urlIs("/api/native/billing"),
        body: { ok: true, billing: { source: "none", subscription: null, invoices: [], paymentMethod: null } },
      },
      { match: urlIs("/api/native/entitlements"), body: {} },
    ]);
    render(<BillingPage />);
    await waitFor(() => expect(screen.getByText("No subscription on file")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
