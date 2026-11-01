/**
 * SLICE 167 — D-15: the approval queue tells the truth about its own state.
 *
 * THE DEFECT THIS PINS (portal audit pass 3). `/api/native/proposals/writes`
 * returns the FULL durable history — applied writes included — which is correct
 * for a record. The page did not filter it: it counted `status === "pending"`
 * for the heading but rendered the WHOLE array, so a write that had already been
 * applied came back as a row that still looked waiting and still offered its own
 * **Apply** button. Heading said "(1)", the list showed two, and one of them was
 * a lie.
 *
 * A second, smaller lie lived in Apply itself: the server answers a replay with
 * `200 { data: { alreadyApplied: true } }`, and the page printed "Write applied."
 * regardless — reporting a change that did not happen.
 *
 * Every assertion below fails on the pre-fix code: the pre-fix page rendered two
 * Apply buttons and no footnote, and printed "Write applied." for the replay.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
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
import { mockFetch, urlHas } from "./helpers/portal-primitive-fetch";

const PROPOSAL = {
  id: "prop_1",
  title: "Queue Truth Proposal",
  clientName: "Acme Testing Ltd",
  clientEmail: "qa-client@acme.test",
  clientCompany: "Acme Testing",
  status: "draft",
  currency: "USD",
  total: "USD 300.00",
  validityDays: 30,
  version: 1,
  hasPdf: false,
  shareUrl: null as string | null,
  updatedAt: "2026-11-01T20:36:21.000Z",
};

const pendingWrite = {
  id: "w_pending_1",
  op: "create_write",
  proposalId: "prop_1",
  status: "pending",
  approvalActionId: "act_1",
  via: "portal",
  requestedBy: "owner@simplerlife.test",
  requestedAt: "2026-11-01T20:00:00.000Z",
};

const appliedWrite = {
  id: "w_applied_1",
  op: "open_write",
  proposalId: "prop_1",
  status: "applied",
  approvalActionId: "act_0",
  via: "portal",
  requestedBy: "owner@simplerlife.test",
  requestedAt: "2026-11-01T19:00:00.000Z",
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
    component: () => <div>detail</div>,
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

describe("D-15 — the pending-writes queue lists only what is actually pending", () => {
  it("renders ONE row for one pending write, counts it once, and does not re-offer the applied one", async () => {
    mockFetch([
      { match: urlHas("/api/native/proposals/writes"), body: { data: [pendingWrite, appliedWrite] } },
      { match: urlHas("/api/native/proposals"), body: { data: [PROPOSAL] } },
    ]);
    renderPortal();

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: /Pending writes \(1\)/ })).toBeInTheDocument(),
    );

    // ONE row, so exactly one Apply control — not two.
    expect(screen.getAllByRole("button", { name: "Apply" })).toHaveLength(1);

    // The pending write is shown…
    expect(screen.getByText("create_write")).toBeInTheDocument();
    // …the already-applied write is NOT shown as an actionable row.
    expect(screen.queryByText("open_write")).not.toBeInTheDocument();

    // …and the page says where it went, rather than silently dropping it.
    expect(screen.getByText("1 write already applied — not listed here.")).toBeInTheDocument();
  });

  it("says nothing is waiting, and counts every applied write, when the whole history is applied", async () => {
    mockFetch([
      {
        match: urlHas("/api/native/proposals/writes"),
        body: { data: [appliedWrite, { ...appliedWrite, id: "w_applied_2", op: "approve_write" }] },
      },
      { match: urlHas("/api/native/proposals"), body: { data: [PROPOSAL] } },
    ]);
    renderPortal();

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: /Pending writes \(0\)/ })).toBeInTheDocument(),
    );
    expect(screen.getByText("Nothing waiting for approval.")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: "Apply" })).toHaveLength(0);
    expect(screen.getByText("2 writes already applied — not listed here.")).toBeInTheDocument();
  });
});

describe("D-15 — Apply reports what the server said, not what the page hoped", () => {
  it("surfaces the server's alreadyApplied instead of claiming 'Write applied.'", async () => {
    mockFetch([
      // The replay answer: 200, nothing changed.
      { match: urlHas("/apply"), body: { data: { alreadyApplied: true } } },
      { match: urlHas("/api/native/proposals/writes"), body: { data: [pendingWrite] } },
      { match: urlHas("/api/native/proposals"), body: { data: [PROPOSAL] } },
    ]);
    renderPortal();

    const apply = await screen.findByRole("button", { name: "Apply" });
    fireEvent.click(apply);

    await waitFor(() =>
      expect(screen.getByText("That write was already applied — nothing changed.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Write applied.")).not.toBeInTheDocument();
  });

  it("still says 'Write applied.' when the server really applied it", async () => {
    mockFetch([
      { match: urlHas("/apply"), body: { data: { alreadyApplied: false } } },
      { match: urlHas("/api/native/proposals/writes"), body: { data: [pendingWrite] } },
      { match: urlHas("/api/native/proposals"), body: { data: [PROPOSAL] } },
    ]);
    renderPortal();

    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByText("Write applied.")).toBeInTheDocument());
    expect(screen.queryByText("That write was already applied — nothing changed.")).not.toBeInTheDocument();
  });

  it("reports a failed apply as a failure", async () => {
    mockFetch([
      { match: urlHas("/apply"), status: 409, body: { error: "Write is not pending" } },
      { match: urlHas("/api/native/proposals/writes"), body: { data: [pendingWrite] } },
      { match: urlHas("/api/native/proposals"), body: { data: [PROPOSAL] } },
    ]);
    renderPortal();

    fireEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByText("Write is not pending")).toBeInTheDocument());
    expect(screen.queryByText("Write applied.")).not.toBeInTheDocument();
  });
});
