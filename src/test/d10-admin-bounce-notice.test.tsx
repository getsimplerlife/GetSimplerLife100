/**
 * SLICE 168 — D-10 (audit sweep A, MEDIUM: honesty).
 *
 * THE DEFECT THIS PINS. `src/lazy/portal.admin.page.tsx` guarded the admin
 * panel with
 *
 *     if (userData.role !== "admin" && userData.role !== "owner") {
 *       navigate({ to: "/portal" });
 *
 * — a silent teleport. Sweep A drove all nine `/portal/admin*` routes as a
 * non-owner: every one bounced to `/portal` with NO message, no toast, no
 * `role="alert"`. A non-owner could not tell whether they had been refused or
 * had mis-clicked. The sweep's PASS wording is "bounces *and says so in
 * words*"; it did not.
 *
 * This file drives the REAL admin layout in a real router and asserts both
 * halves: the bounce still happens, and the dashboard it lands on says why.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import AdminLayout from "../lazy/portal.admin.page";
import PortalDashboard from "../lazy/portal.index.page";
import { PortalBounceNotice } from "../components/PortalBounceNotice";
import { PortalContext } from "../routes/portal.context";
import { mockFetch, urlIs } from "./helpers/portal-primitive-fetch";

const portalValue = {
  userEmail: "user-qa@example.test",
  feed: [],
  unreadCount: 0,
  notificationsError: null,
  updatedAt: null,
  refreshNotifications: () => {},
};

function renderPortalRouter(initial: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const portalRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/portal",
    validateSearch: (search: Record<string, unknown>): { notice?: string } => ({
      notice: typeof search.notice === "string" ? search.notice : undefined,
    }),
    component: () => (
      <PortalContext.Provider value={portalValue}>
        <PortalDashboard />
      </PortalContext.Provider>
    ),
  });
  const adminRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/portal/admin",
    component: AdminLayout,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([portalRoute, adminRoute]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("D-10 — the admin bounce still happens", () => {
  it("a non-owner landing on /portal/admin is sent to /portal", async () => {
    mockFetch([{ match: urlIs("/api/me"), body: { user: { email: "user-qa@example.test", role: "user" } } }]);
    const router = renderPortalRouter("/portal/admin");
    await waitFor(() => expect(router.state.location.pathname).toBe("/portal"));
  });
});

describe("D-10 — the bounce says so in words", () => {
  it("carries the reason and the dashboard renders it as an alert", async () => {
    mockFetch([{ match: urlIs("/api/me"), body: { user: { email: "user-qa@example.test", role: "user" } } }]);
    const router = renderPortalRouter("/portal/admin");

    await waitFor(() => expect(router.state.location.pathname).toBe("/portal"));
    // The reason travels in the URL…
    expect((router.state.location.search as { notice?: string }).notice).toBe("admin-required");

    // …and the dashboard says it in words.
    //
    // SLICE 183 — this fixture stubs only `/api/me`, so the dashboard's own
    // reads are unmocked. Since 183 an unmocked read is a READ FAILURE and the
    // dashboard correctly renders a second `role="alert"` for it, so
    // `findByRole("alert")` now throws "found multiple elements". The intent
    // here is unchanged — the bounce must arrive as an alert carrying the
    // reason — so select the alert that carries it rather than assuming it is
    // the only one on the page.
    const alerts = await screen.findAllByRole("alert");
    const alert = alerts.find((a) => /restricted to the workspace owner/i.test(a.textContent || ""));
    expect(alert, "no alert carried the bounce reason").toBeTruthy();
    expect(alert!.textContent || "").toMatch(/sent back to your dashboard/i);
  });

  it("renders nothing for an absent or unknown notice code (never invents a message)", () => {
    const { container: none } = render(<PortalBounceNotice />);
    expect(none.textContent).toBe("");
    cleanup();
    const { container: unknown } = render(<PortalBounceNotice notice="something-else" />);
    expect(unknown.textContent).toBe("");
  });
});
