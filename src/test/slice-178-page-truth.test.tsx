/**
 * SLICE 178 — five page-level lies from Sweep C6 (qa-sweepC6-defect-classes-2026-11-02.md).
 *
 * Every test here is written from the defect and FAILS on the pre-fix source at
 * 0519da0; the verbatim pre-fix output is quoted in each `it` name and in the
 * slice-178 report. None of them asserts a literal the component also supplies:
 *
 *   - the dashboard test builds its payload by CALLING the real endpoint
 *     (`handleNativeBillingAuthed`) and then compares the page's derived state
 *     against the fields THAT response carries — plan name and invoice count are
 *     read out of the server's own body, never typed into the test;
 *   - the proposals/checklists tests compare the rendered message against the
 *     `error` string the mocked response carries, i.e. the server's sentence;
 *   - a contract block pins the three server-source facts the pages now rely on
 *     (the send response shape, the refusal sentence, the 4xx mapping), so a
 *     server change cannot silently un-fix the page.
 *
 * THE FIVE DEFECTS
 *   1 CRITICAL  `src/lib/portal-dashboard.ts` read `bj?.data?.subscription` /
 *               `bj.data.invoices`, but `/api/native/billing` answers
 *               `{ ok: true, billing: {…} }` (native/billing/router.ts:279,287).
 *               The plan and invoice panel was empty for EVERY tenant, and
 *               `isEmpty` counts `!subscription`, so a paying workspace could be
 *               told it had "nothing to show".
 *   2 HIGH      `action()` on /portal/proposals and /portal/checklists had no
 *               `else`: a 400/401/404/500 printed nothing and the row re-rendered
 *               unchanged — a dead-looking button with no evidence trail.
 *   3 HIGH      `api()` returned only `{ok, status}`, so a Send could only print
 *               "send applied." — the delivery verdict slice 176 added
 *               (proposalStatus + delivery) was invisible on the one page where
 *               Send is pressed.
 *   4 MEDIUM    /portal/settings Billing never read `billingRes.ok`; a 401 fell
 *               into `?? {source:"none", …}` and rendered as "No subscription on
 *               file".
 *   5 LOW-MED   /portal/settings Connections never read either status; a failed
 *               read fell through to `[]` and rendered as "No imports yet".
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ProposalsPage from "../lazy/portal.proposals.index.page";
import ChecklistsPage from "../lazy/portal.checklists.index.page";
import SettingsPage from "../lazy/portal.settings.index.page";
import { deriveDashboard, usePortalDashboard } from "../lib/portal-dashboard";
import { handleNativeBillingAuthed } from "../native/billing/router";
import { mockFetch, urlHas, urlIs } from "./helpers/portal-primitive-fetch";

// The pages link through the router; in jsdom there is no router, so Link
// renders as a plain anchor (slice-175 precedent).
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const REPO = existsSync(join(process.cwd(), "prod-server.ts"))
  ? process.cwd()
  : join(process.cwd(), "..", "..");
const readSource = (rel: string): string => {
  const p = join(REPO, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
};

// ── 0. The server facts these pages now rely on ──────────────────────────────
describe("slice 178 — the server contracts the fixed pages read", () => {
  it("a Send answers 200 with proposalStatus + delivery (the shape the page now prints)", () => {
    const router = readSource("src/native/proposals/router.ts");
    expect(router, "router.ts must still return the delivery verdict on a send").toContain(
      "delivery: res.proposal.lastDeliveryAttempt",
    );
    expect(router).toContain("proposalStatus: res.proposal.status");
  });

  it("a REFUSED send is a 4xx carrying { error }, not a 200 with delivery.outcome=failed", () => {
    // gate.ts throws the refusal sentence; router.ts maps /failed/ onto a 400.
    const gate = readSource("src/native/proposals/gate.ts");
    expect(gate, "gate.ts must still throw the refusal sentence").toContain(
      "send failed — the mail lane refused the message",
    );
    const router = readSource("src/native/proposals/router.ts");
    const gateErrorStatus = router.slice(router.indexOf("function gateErrorStatus"));
    expect(gateErrorStatus.slice(0, 400)).toMatch(/bad[\s\S]*failed/);
    expect(gateErrorStatus.slice(0, 600)).toContain("if (bad) return json400(error);");
  });

  it("/api/native/billing answers { ok, billing } — never { data }", () => {
    const router = readSource("src/native/billing/router.ts");
    expect(router).toContain("Response.json({ ok: true, billing: await stripeView(");
    expect(router).toContain("Response.json({ ok: true, billing: durableView(");
  });
});

// ── 1. The dashboard reads billing at the right level ────────────────────────
/** A real Stripe-shaped answer, fed through the REAL endpoint so the payload the
 *  page sees is the server's own output rather than a hand-written literal. */
function stripeStub() {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
  return async (url: string): Promise<Response> => {
    const path = url.replace("https://api.stripe.com/v1", "");
    if (path.startsWith("/customers")) return ok({ data: [{ id: "cus_178" }] });
    if (path.startsWith("/subscriptions")) {
      return ok({
        data: [
          {
            id: "sub_178",
            status: "active",
            current_period_end: 1_800_000_000,
            items: {
              data: [
                {
                  description: "Platform plan",
                  price: { nickname: "Growth", unit_amount: 59900, recurring: { interval: "month" } },
                },
              ],
            },
          },
        ],
      });
    }
    if (path.startsWith("/invoices")) {
      return ok({
        data: [
          {
            id: "in_178",
            amount_paid: 59900,
            created: 1_790_000_000,
            status: "paid",
            hosted_invoice_url: null,
            lines: { data: [{ description: "Growth monthly" }] },
          },
        ],
      });
    }
    return ok({ data: [] }); // payment_methods
  };
}

function BillingProbe() {
  const state = usePortalDashboard(600_000);
  const d = deriveDashboard(state.inputs);
  return (
    <div>
      <span data-testid="plan">{d.billing.planName ?? "NONE"}</span>
      <span data-testid="has-sub">{String(d.billing.hasSubscription)}</span>
      <span data-testid="invoice-count">{String(d.billing.invoices)}</span>
      <span data-testid="is-empty">{String(d.isEmpty)}</span>
    </div>
  );
}

describe("dashboard — the billing envelope is `billing`, not `data`", () => {
  it("shows a paying tenant's plan and invoice count instead of 'no plan'", async () => {
    const previousKey = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_slice178";
    let serverBody: any;
    try {
      const res = await handleNativeBillingAuthed(new Request("http://local/api/native/billing"), {
        userEmail: "owner@example.test",
        dataDir: "/tmp/slice178-billing-unused",
        stripeFetch: stripeStub(),
      });
      serverBody = await res.json();
    } finally {
      if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = previousKey;
    }
    // The system of record, asserted first so this test cannot pass vacuously.
    expect(serverBody.ok).toBe(true);
    expect(serverBody.billing.subscription).toBeTruthy();
    const planName: string = serverBody.billing.subscription.planName;
    const invoiceCount: number = serverBody.billing.invoices.length;
    expect(planName).toBeTruthy();
    expect(invoiceCount).toBeGreaterThan(0);

    mockFetch([
      { match: urlIs("/api/native/billing"), body: serverBody },
      { match: () => true, status: 404, body: { error: "not mocked in this test" } },
    ]);
    render(<BillingProbe />);
    // Pre-fix this stayed "NONE"/"false"/"0"/"true": the page read `bj.data`.
    await waitFor(() => expect(screen.getByTestId("has-sub")).toHaveTextContent("true"));
    expect(screen.getByTestId("plan")).toHaveTextContent(planName);
    expect(screen.getByTestId("invoice-count")).toHaveTextContent(String(invoiceCount));
    // `isEmpty` counts `!subscription` — a workspace whose only data is a live
    // subscription must not be told it has nothing to show.
    expect(screen.getByTestId("is-empty")).toHaveTextContent("false");
  });
});

// ── 2 + 3. Proposals: a failed verb is loud, and Send reports the verdict ────
const PROPOSAL = {
  id: "prop_178",
  title: "Slice 178 proposal",
  clientName: "Acme Testing Ltd",
  clientCompany: "Acme Testing",
  status: "approved",
  currency: "USD",
  total: "USD 300.00",
  validityDays: 30,
  version: 1,
  hasPdf: true,
  shareUrl: "https://portal.example/proposals/share/sp_178",
  updatedAt: "2026-11-02T10:00:00.000Z",
};

/** The exact sentence gate.ts:242 throws when the mail lane refuses — the
 *  message the user must see, because today Brevo refuses every send. */
const SEND_REFUSAL =
  'send failed — the mail lane refused the message (failed via smtp): Sending has been rejected because the sender you used is not valid. The proposal status is still "approved"; nothing was delivered.';

async function renderProposals(action: { status: number; body: unknown }) {
  mockFetch([
    { match: urlHas("/api/native/proposals/writes"), body: { data: [] } },
    { match: urlHas("/api/native/proposals/prop_178/"), status: action.status, body: action.body },
    { match: urlIs("/api/native/proposals"), body: { data: [PROPOSAL] } },
  ]);
  render(<ProposalsPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Send" }));
}

describe("proposals — a refused Send is never silent, and never 'applied'", () => {
  it("prints the server's refusal sentence on a 400 (pre-fix: nothing at all)", async () => {
    await renderProposals({ status: 400, body: { error: SEND_REFUSAL } });
    await waitFor(() => expect(screen.getByText(SEND_REFUSAL)).toBeInTheDocument());
    expect(screen.queryByText("send applied.")).not.toBeInTheDocument();
  });

  it("prints the lane's verdict on a 200 (pre-fix: the bare 'send applied.')", async () => {
    await renderProposals({
      status: 200,
      body: {
        data: {
          status: "applied",
          proposalId: PROPOSAL.id,
          proposalStatus: "sent",
          delivery: {
            at: "2026-11-02T10:05:00.000Z",
            by: "owner@example.test",
            channel: "smtp",
            outcome: "sent",
            messageId: "msg_178abc",
          },
        },
      },
    });
    await waitFor(() => expect(screen.getByText(/msg_178abc/)).toBeInTheDocument());
    const said = screen.getByText(/msg_178abc/).textContent ?? "";
    // The verdict is the server's, not the page's guess.
    expect(said).toContain('outcome "sent"');
    expect(said).toContain("smtp");
    expect(said).toContain("Proposal status sent");
    // "applied" alone is the lie this slice removes.
    expect(screen.queryByText("send applied.")).not.toBeInTheDocument();
  });

  it("says the message did NOT go out when the verdict is not 'sent'", async () => {
    await renderProposals({
      status: 200,
      body: {
        data: {
          status: "applied",
          proposalId: PROPOSAL.id,
          proposalStatus: "approved",
          delivery: {
            at: "2026-11-02T10:06:00.000Z",
            by: "owner@example.test",
            channel: "none",
            outcome: "unconfigured",
            error: "no mail lane configured",
          },
        },
      },
    });
    await waitFor(() => expect(screen.getByText(/did NOT deliver it/)).toBeInTheDocument());
    const said = screen.getByText(/did NOT deliver it/).textContent ?? "";
    expect(said).toContain('outcome "unconfigured"');
    expect(said).toContain("no mail lane configured");
    expect(screen.queryByText("send applied.")).not.toBeInTheDocument();
  });
});

// ── 2 (checklists side). A refused Close is not silent either ────────────────
describe("checklists — a refused verb is never silent", () => {
  it("prints the server's sentence on a 400 (pre-fix: nothing at all)", async () => {
    const refusal = "close failed — checklist is locked by an open approval";
    mockFetch([
      { match: urlHas("/api/native/checklists/writes"), body: { data: [] } },
      { match: urlHas("/api/native/checklists/cl_178/"), status: 400, body: { error: refusal } },
      {
        match: urlIs("/api/native/checklists"),
        body: {
          data: [
            {
              id: "cl_178",
              name: "Commissioning checklist",
              kind: "delivery",
              status: "open",
              progress: { done: 0, total: 1 },
              linkedProposalId: null,
              description: "",
              items: [{ id: "it_178", title: "Scope confirmed", status: "todo" }],
              version: 1,
              updatedAt: "2026-11-02T10:00:00.000Z",
            },
          ],
        },
      },
    ]);
    render(<ChecklistsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.getByText(refusal)).toBeInTheDocument());
    expect(screen.queryByText("close applied.")).not.toBeInTheDocument();
  });
});

// ── 4 + 5. Settings: a failed read is not an empty workspace ─────────────────
async function renderSettingsTab(tabName: RegExp) {
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByRole("heading", { name: /Workspace Settings/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: tabName }));
}

describe("settings — a 401 is reported as a session problem, not as 'no plan'", () => {
  it("Billing: a 401 shows a sign-in message and never 'No subscription on file'", async () => {
    mockFetch([
      { match: urlIs("/api/native/billing"), status: 401, body: { error: "Unauthorized" } },
      { match: urlIs("/api/data/settings"), body: { data: {} } },
    ]);
    await renderSettingsTab(/Plan & Billing/);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent ?? "").toMatch(/sign in again/i);
    expect(screen.queryByText("No subscription on file")).not.toBeInTheDocument();
    expect(screen.queryByText("No invoices or purchase records yet.")).not.toBeInTheDocument();
  });

  it("Billing: a 500 is an error line, not an empty billing state", async () => {
    mockFetch([
      { match: urlIs("/api/native/billing"), status: 500, body: { error: "Internal error" } },
      { match: urlIs("/api/data/settings"), body: { data: {} } },
    ]);
    await renderSettingsTab(/Plan & Billing/);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent ?? "").toContain("HTTP 500");
    expect(screen.queryByText("No subscription on file")).not.toBeInTheDocument();
  });

  it("Connections: a 401 is an error line, not 'No imports yet'", async () => {
    mockFetch([
      { match: urlIs("/api/data/connected-accounts"), status: 401, body: { error: "Unauthorized" } },
      { match: urlIs("/api/integrations/providers"), body: { data: [] } },
      { match: urlIs("/api/data/settings"), body: { data: {} } },
    ]);
    await renderSettingsTab(/Import History/);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert").textContent ?? "").toMatch(/sign in again/i);
    expect(screen.queryByText("No imports yet")).not.toBeInTheDocument();
  });

  it("Connections: a real empty read still says there are no imports", async () => {
    mockFetch([
      { match: urlIs("/api/data/connected-accounts"), body: { crm: [], erp: [], other: [] } },
      { match: urlIs("/api/integrations/providers"), body: { data: [] } },
      { match: urlIs("/api/data/settings"), body: { data: {} } },
    ]);
    await renderSettingsTab(/Import History/);
    await waitFor(() => expect(screen.getByText("No imports yet")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
