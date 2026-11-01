/**
 * SLICE 167 — D-16: "Open" on a proposal opens the proposal.
 *
 * THE DEFECT THIS PINS (portal audit pass 2, D-16). On /portal/proposals the
 * row's **Open** button did not open anything: it POSTed `/…/:id/open` (queueing
 * a lifecycle write) and left `location.pathname` at /portal/proposals, so the
 * quote itself — its client, line items, terms and share/e-sign controls — could
 * not be read anywhere in the product. Once the status flipped to PENDING the
 * row stopped offering the control at all.
 *
 * These tests render the REAL router with the REAL pages, click Open, and assert
 * that the URL changes to the detail route and that the detail view renders the
 * proposal's actual contents.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import ProposalsPage from "../lazy/portal.proposals.index.page";
import ProposalDetailPage from "../lazy/portal.proposals.$proposalId.page";
import { mockFetch, urlHas } from "./helpers/portal-primitive-fetch";

const PROPOSAL = {
  id: "prop_abc123",
  title: "QA Proposal Alpha",
  clientName: "Acme Testing Ltd",
  clientEmail: "qa-client@acme.test",
  clientCompany: "Acme Testing",
  status: "draft",
  currency: "USD",
  total: "USD 300.00",
  totalCents: 30000,
  validityDays: 30,
  version: 1,
  hasPdf: false,
  shareUrl: null as string | null,
  updatedAt: "2026-11-01T20:36:21.000Z",
  terms: "Net 30",
  lineItems: [
    { id: "li_1", description: "QA sweep line item", qty: 2, unitPrice: 150 },
    { id: "li_2", description: "Onboarding call", qty: 1, unitPrice: 75.5 },
  ],
  signatures: [] as Array<Record<string, unknown>>,
};

function renderPortal() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/portal/proposals",
    component: ProposalsPage,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/portal/proposals/$proposalId",
    component: ProposalDetailPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([listRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: ["/portal/proposals"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("D-16 — the detail route exists and is wired", () => {
  it("has a route file that mounts the detail page", () => {
    const routeFile = "src/routes/portal.proposals.$proposalId.tsx";
    expect(existsSync(routeFile)).toBe(true);
    const src = readFileSync(routeFile, "utf8");
    expect(src).toContain('createFileRoute("/portal/proposals/$proposalId")');
    expect(src).toContain("~/lazy/portal.proposals.$proposalId.page");
  });

  it("the row's Open control navigates instead of queueing a write", () => {
    const src = readFileSync("src/lazy/portal.proposals.index.page.tsx", "utf8");
    expect(src).toContain('to="/portal/proposals/$proposalId"');
    // The old control queued the lifecycle verb from the row.
    expect(src).not.toContain('action(p.id, "open")');
  });
});

describe("D-16 — Open really opens the proposal", () => {
  it("navigates to /portal/proposals/:id and renders its client, line items, terms and share state", async () => {
    mockFetch([
      { match: urlHas("/api/native/proposals/writes"), body: { data: [] } },
      { match: urlHas("/api/native/proposals/prop_abc123"), body: { data: PROPOSAL } },
      { match: urlHas("/api/native/proposals"), body: { data: [PROPOSAL] } },
    ]);
    const router = renderPortal();
    const open = await screen.findByRole("link", { name: "Open" });
    fireEvent.click(open);

    await waitFor(() => expect(router.state.location.pathname).toBe("/portal/proposals/prop_abc123"));

    // The quote is readable: heading, client, both line items, totals and terms.
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "QA Proposal Alpha" })).toBeInTheDocument(),
    );
    expect(screen.getByText("QA sweep line item")).toBeInTheDocument();
    expect(screen.getByText("Onboarding call")).toBeInTheDocument();
    expect(screen.getByText("USD 150.00")).toBeInTheDocument(); // unit price
    expect(screen.getByText("USD 300.00")).toBeInTheDocument(); // line total (2 × 150)
    expect(screen.getByText("USD 75.50")).toBeInTheDocument(); // unit price + line total
    expect(screen.getByText("qa-client@acme.test")).toBeInTheDocument();
    expect(screen.getByText("Acme Testing")).toBeInTheDocument();
    expect(screen.getByText("Net 30")).toBeInTheDocument();
    expect(screen.getByText("30 days")).toBeInTheDocument();
    // Draft → no client link yet, and the page says why instead of showing a dead control.
    expect(screen.getByText(/No client link yet/)).toBeInTheDocument();
    expect(screen.getByText("Not signed yet.")).toBeInTheDocument();
  });

  it("shows the share link and captured e-signature for a proposal that has them", async () => {
    const opened = {
      ...PROPOSAL,
      status: "approved",
      shareUrl: "https://portal.example/proposals/share/sp_abc",
      hasPdf: true,
      signatures: [
        {
          id: "sig_1",
          signerName: "Dana Client",
          signatureType: "typed",
          payloadHash: "a".repeat(64),
          capturedAt: "2026-11-01T21:00:00.000Z",
        },
      ],
    };
    mockFetch([
      { match: urlHas("/api/native/proposals/writes"), body: { data: [] } },
      { match: urlHas("/api/native/proposals/prop_abc123"), body: { data: opened } },
      { match: urlHas("/api/native/proposals"), body: { data: [opened] } },
    ]);
    const router = renderPortal();
    fireEvent.click(await screen.findByRole("link", { name: "Open" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/portal/proposals/prop_abc123"));

    await waitFor(() => expect(screen.getByText("https://portal.example/proposals/share/sp_abc")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Copy client link" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the client view" })).toBeInTheDocument();
    expect(screen.getByText("Dana Client")).toBeInTheDocument();
    expect(screen.getByText(/sha256 a{64}/)).toBeInTheDocument();
  });
});
