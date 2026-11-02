import type { ReactElement } from "react";
/**
 * slice-176-write-path-truth.test.tsx — the customer-facing write paths stop
 * claiming things that did not happen.
 *
 * Four defects the 50-route portal audit found by reading source (Sweeps C3/C4),
 * each confirmed against the code that settles it before anything was changed:
 *
 *  1. proposals "Send" rendered the final PDF, stored it, stamped the record
 *     `sent`, audited it and fired a webhook with ZERO mail calls
 *     (native/proposals/gate.ts, the `op === "send"` branch). The client got
 *     nothing. Now it dispatches through the SAME lane invoices use
 *     (integrations/email.ts via native/proposals/delivery.ts) and only reaches
 *     `sent` on a provider acknowledgement.
 *  2. `/portal/invoices` and `/portal/deal-rooms` rendered only an Apply button
 *     although BOTH servers implement `writes/:id/reject`
 *     (invoice/router.ts, dealroom/router.ts) — a reviewer could only say yes.
 *  3. `/portal/invoices` printed "the invoice was emailed and the provider
 *     acknowledged it" from the invoice's STATUS, so re-pressing Apply on an
 *     already-applied write claimed a delivery that never happened.
 *  4. `/portal/industries` never checked `res.ok`, printed "Success"
 *     unconditionally and then rewrote the row in the browser (its follow-up
 *     POST carries no `action`, so the server ignores it outright).
 *
 * Every assertion here fails on the pre-fix code. The expected values are taken
 * from the system of record — the store, the router's response body, the audit
 * log — never from a string the component also supplies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { getProposal, listAudit, listPendingWrites } from "../native/proposals/store";
import { handleNativeProposalsAuthed, registerBuiltinNativeProposalEventTypes } from "../native/proposals/router";
import { clearMailLane } from "./mail-lane-isolation";
import { mockFetch, urlHas } from "./helpers/portal-primitive-fetch";
import InvoicesPage from "../lazy/portal.invoices.index.page";
import DealRoomsPage from "../lazy/portal.deal-rooms.index.page";
import IndustriesPage from "../lazy/portal.industries.index.page";

const T1 = "tenant-a@acme.test";
const CLIENT_EMAIL = "pat@acme.test";

// ── shared server harness (proposals) ───────────────────────────────────────
let dir: string;
let restoreMailLane: () => void;

function authedReq(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET") return new Request(url);
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
}
async function route(method: string, pathname: string, body?: unknown) {
  return handleNativeProposalsAuthed(authedReq(method, pathname, body), { userEmail: T1, dataDir: dir });
}
function pendingFirst(op: string) {
  return listPendingWrites(dir, T1).find((w) => w.status === "pending" && w.op === op) ?? null;
}
function validBody() {
  return {
    title: "Acme Q3 Automation",
    clientName: "Pat Owner",
    clientEmail: CLIENT_EMAIL,
    clientCompany: "Acme Corp",
    lineItems: [{ description: "Discovery workshop", qty: 2, unitPrice: 49.99 }],
    currency: "USD",
    terms: "Net 30",
    validityDays: 30,
  };
}

/** The id of the most recently created proposal for T1. */
async function proposalsFirstId(): Promise<string> {
  const res = await route("GET", "/api/native/proposals");
  const body = (await res.json()) as { data: { id: string }[] };
  return body.data[body.data.length - 1].id;
}

const ACK_202 = () =>
  ({
    status: 202,
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === "x-message-id" ? "sg-test-msg-1" : null) },
    text: async () => "",
  }) as unknown as Response;
const REJECT_500 = () =>
  ({
    status: 500,
    ok: false,
    headers: { get: () => null },
    text: async () => "sender you used is not valid",
  }) as unknown as Response;

beforeEach(() => {
  restoreMailLane = clearMailLane();
  dir = mkdtempSync(join(tmpdir(), "slice176-"));
  registerBuiltinNativeProposalEventTypes();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  restoreMailLane();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// ITEM 1 — proposals "Send" must actually send, and must fail honestly
// ═══════════════════════════════════════════════════════════════════════════
describe("ITEM 1 — proposals send goes through the real mail lane", () => {
  /** Walk a proposal to `approved` so `send` is a legal transition. */
  async function toApproved(): Promise<string> {
    const created = await route("POST", "/api/native/proposals", validBody());
    expect(created.status).toBe(202);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("create")!.id}/apply`);
    const id = await proposalsFirstId();
    expect((await route("POST", `/api/native/proposals/${id}/open`)).status).toBe(202);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("open")!.id}/apply`);
    expect((await route("POST", `/api/native/proposals/${id}/approve`)).status).toBe(202);
    await route("POST", `/api/native/proposals/writes/${pendingFirst("approve")!.id}/apply`);
    const p = getProposal(dir, T1, id)!;
    expect(p.status).toBe("approved"); // the precondition send needs
    expect(p.shareSlug).toBeTruthy();
    return id;
  }

  it("the mail lane REFUSES → status never becomes 'sent', the response carries the refusal", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    const fetchMock = vi.fn(async () => REJECT_500());
    vi.stubGlobal("fetch", fetchMock);
    const id = await toApproved();

    expect((await route("POST", `/api/native/proposals/${id}/send`)).status).toBe(202);
    const applied = await route("POST", `/api/native/proposals/writes/${pendingFirst("send")!.id}/apply`);

    // The refusal is NOT reported as an applied write.
    expect(applied.status).not.toBe(200);
    const body = (await applied.json()) as { error?: string; data?: unknown };
    expect(body.data).toBeUndefined();
    expect(body.error).toMatch(/mail lane refused/i);
    // …and it names the lane's own reason, so the user can act on it.
    expect(body.error).toMatch(/sender you used is not valid/);

    // The record tells the truth: still approved, never sent.
    const p = getProposal(dir, T1, id)!;
    expect(p.status).toBe("approved");
    expect(p.sentAt).toBeUndefined();
    expect(p.lastDeliveryAttempt?.outcome).toBe("failed");
    expect(p.lastDeliveryAttempt?.error).toMatch(/sender you used is not valid/);

    // The audit records a FAILED send, never a sent one.
    const actions = listAudit(dir, T1).map((a) => a.action);
    expect(actions).toContain("native.proposal.send_failed");
    expect(actions).not.toContain("native.proposal.sent");
  });

  it("no mail lane configured → nothing dispatched, nothing claimed as sent", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "");
    const fetchMock = vi.fn(async () => ACK_202());
    vi.stubGlobal("fetch", fetchMock);
    const id = await toApproved();

    await route("POST", `/api/native/proposals/${id}/send`);
    const applied = await route("POST", `/api/native/proposals/writes/${pendingFirst("send")!.id}/apply`);

    expect(applied.status).not.toBe(200);
    expect(fetchMock).not.toHaveBeenCalled(); // no lane → no dispatch at all
    const p = getProposal(dir, T1, id)!;
    expect(p.status).toBe("approved");
    expect(p.sentAt).toBeUndefined();
    expect(p.lastDeliveryAttempt?.outcome).toBe("unconfigured");
    expect(listAudit(dir, T1).map((a) => a.action)).not.toContain("native.proposal.sent");
  });

  it("provider ACKNOWLEDGES → status sent AND a real message left, addressed to the client with the share link", async () => {
    vi.stubEnv("SENDGRID_API_KEY", "SG.test-key");
    vi.stubEnv("SITE_ORIGIN", "https://proposals.example.test");
    const fetchMock = vi.fn(async () => ACK_202());
    vi.stubGlobal("fetch", fetchMock);
    const id = await toApproved();

    await route("POST", `/api/native/proposals/${id}/send`);
    const applied = await route("POST", `/api/native/proposals/writes/${pendingFirst("send")!.id}/apply`);
    expect(applied.status).toBe(200);

    const p = getProposal(dir, T1, id)!;
    expect(p.status).toBe("sent");
    expect(p.sentAt).toBeTruthy();
    expect(p.lastDeliveryAttempt?.outcome).toBe("sent");
    expect(p.lastDeliveryAttempt?.messageId).toBe("sg-test-msg-1");

    // THE POINT OF THE SLICE: a message really left the building.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    const payload = JSON.parse(init.body) as {
      personalizations: { to: { email: string }[] }[];
      content: { value: string }[];
    };
    expect(payload.personalizations[0].to[0].email).toBe(CLIENT_EMAIL);
    const bodyText = payload.content.map((c) => c.value).join("\n");
    expect(bodyText).toContain(`https://proposals.example.test/proposals/share/${p.shareSlug}`);
    // The audit names the acknowledgement it actually got.
    expect(listAudit(dir, T1).some((a) => a.action === "native.proposal.sent" && a.detail.includes("sg-test-msg-1"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ITEM 2 + 3 — the approval queues can say no, and Apply stops inventing
//             a delivery that did not happen
// ═══════════════════════════════════════════════════════════════════════════
function renderAt(path: string, component: () => ReactElement) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const r = createRoute({ getParentRoute: () => rootRoute, path, component });
  const router = createRouter({
    routeTree: rootRoute.addChildren([r]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

const INVOICE_WRITE = {
  id: "w_inv_1",
  op: "send",
  invoiceId: "inv_1",
  status: "pending",
  approvalActionId: "act_inv_1",
  via: "portal",
  requestedBy: T1,
  requestedAt: "2026-11-02T10:00:00.000Z",
};

const DEALROOM_WRITE = {
  id: "w_dr_1",
  op: "update",
  dealRoomId: "dr_1",
  status: "pending",
  approvalActionId: "act_dr_1",
  via: "portal",
  requestedBy: T1,
  requestedAt: "2026-11-02T10:00:00.000Z",
};

describe("ITEM 2 — a reviewer can reject, not only approve", () => {
  it("/portal/invoices renders a Reject control for a queued write and it hits the server's reject route", async () => {
    const fetchMock = mockFetch([
      { match: urlHas("/api/native/invoice/writes"), body: { data: [INVOICE_WRITE] } },
      { match: urlHas("/api/native/invoice/stripe"), body: { data: { connected: false } } },
      { match: urlHas("/api/native/invoice"), body: { data: [] } },
      { match: urlHas("/api/native/dealroom"), body: { data: [] } },
    ]);
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderAt("/portal/invoices", InvoicesPage);

    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument());
    const reject = screen.getByRole("button", { name: "Reject" });
    fireEvent.click(reject);

    await waitFor(() =>
      expect(screen.getByText("Write rejected — the change was discarded and nothing was applied.")).toBeInTheDocument(),
    );
    // It used the server verb that already existed — no new endpoint invented.
    const rejectCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith(`/api/native/invoice/writes/${INVOICE_WRITE.id}/reject`));
    expect(rejectCall).toBeTruthy();
    expect((rejectCall as unknown[])[1]).toMatchObject({ method: "POST" });
  });

  it("/portal/deal-rooms renders a Reject control for a queued write and it hits the server's reject route", async () => {
    const fetchMock = mockFetch([
      { match: urlHas("/api/native/dealroom/writes"), body: { data: [DEALROOM_WRITE] } },
      { match: urlHas("/api/native/dealroom"), body: { data: [] } },
      { match: urlHas("/api/native/proposals"), body: { data: [] } },
      { match: urlHas("/api/native/checklists"), body: { data: [] } },
      { match: urlHas("/api/native/invoice"), body: { data: [] } },
    ]);
    vi.stubGlobal("confirm", vi.fn(() => true));
    renderAt("/portal/deal-rooms", DealRoomsPage);

    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(screen.getByText("Write rejected — the change was discarded and nothing was applied.")).toBeInTheDocument(),
    );
    const rejectCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith(`/api/native/dealroom/writes/${DEALROOM_WRITE.id}/reject`));
    expect(rejectCall).toBeTruthy();
    expect((rejectCall as unknown[])[1]).toMatchObject({ method: "POST" });
  });
});

describe("ITEM 3 — re-applying a write stops claiming a delivery that did not happen", () => {
  it("an already-applied write on a 'sent' invoice says nothing was sent, not that the provider acknowledged it", async () => {
    mockFetch([
      {
        match: urlHas("/apply"),
        body: { data: { status: "alreadyApplied", invoiceId: "inv_1", invoiceStatus: "sent", alreadyApplied: true } },
      },
      { match: urlHas("/api/native/invoice/writes"), body: { data: [INVOICE_WRITE] } },
      { match: urlHas("/api/native/invoice/stripe"), body: { data: { connected: false } } },
      { match: urlHas("/api/native/invoice"), body: { data: [] } },
      { match: urlHas("/api/native/dealroom"), body: { data: [] } },
    ]);
    renderAt("/portal/invoices", InvoicesPage);

    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(screen.getByText(/already applied — nothing changed and no email was sent/i)).toBeInTheDocument(),
    );
    // The false claim must be gone. The server said `alreadyApplied`; the
    // invoice's status is merely historical and proves nothing about now.
    expect(screen.queryByText(/emailed and the provider acknowledged it/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/provider acknowledged it/i)).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ITEM 4 — "Activate Template" reports the real outcome
// ═══════════════════════════════════════════════════════════════════════════
const INDUSTRY_ROW = { name: "Retail", status: "Available", description: "Retail blueprint", category: "Commerce" };

/** GET returns `getRows()`; POST answers with `postStatus`/`postBody`. */
function industryFetch(opts: { postStatus: number; postBody: unknown; getRows: () => unknown[] }) {
  const fn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const isPost = (init as RequestInit | undefined)?.method === "POST";
    const status = isPost ? opts.postStatus : 200;
    const body = isPost ? opts.postBody : { data: opts.getRows() };
    return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("ITEM 4 — activating a template reports what the server actually did", () => {
  it("a failed activate shows the server's error and never prints Success", async () => {
    industryFetch({ postStatus: 500, postBody: { error: "Not authenticated" }, getRows: () => [INDUSTRY_ROW] });
    renderAt("/portal/industries", IndustriesPage);

    await waitFor(() => expect(screen.getByRole("button", { name: "Activate Template" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Activate Template" }));

    await waitFor(() => expect(screen.getByText("Not authenticated")).toBeInTheDocument());
    expect(screen.queryByText(/Success/i)).not.toBeInTheDocument();
  });

  it("the badge is the server's status, never a client-side flip", async () => {
    // The server accepted the POST but did NOT change the row. The pre-fix page
    // rewrote the badge itself and printed "Success"; the fixed page re-reads
    // the list and reports what the server says.
    industryFetch({ postStatus: 200, postBody: { success: true }, getRows: () => [INDUSTRY_ROW] });
    renderAt("/portal/industries", IndustriesPage);

    await waitFor(() => expect(screen.getByRole("button", { name: "Activate Template" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Activate Template" }));

    await waitFor(() =>
      expect(screen.getByText('Retail — the server now reports status "Available".')).toBeInTheDocument(),
    );
    // The row still reads the server's value, and the button is still Activate.
    expect(screen.getByRole("button", { name: "Activate Template" })).toBeInTheDocument();
    expect(screen.queryByText("Activated")).not.toBeInTheDocument();
    expect(screen.queryByText(/Success/i)).not.toBeInTheDocument();
  });
});
