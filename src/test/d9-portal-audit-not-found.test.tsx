/**
 * SLICE 168 — D-9 (audit sweep A, HIGH: a user-facing lie).
 *
 * THE DEFECT THIS PINS. `src/routes/portal.$auditId.tsx` is a DYNAMIC child of
 * `/portal`, so `/portal/projects`, `/portal/clients/123` and
 * `/portal/settings/billing` all resolve there. There is no 404 inside the
 * portal. The loader handed the page whatever `getAudit` produced — and in the
 * browser the server-fn polyfill produces `{}` — so the page rendered
 *
 *     ⏳ Audit in Progress
 *     ORDERED ON Invalid Date
 *     Request Adjustments  [textarea] [Submit Adjustment Request]
 *
 * for a customer who had ordered nothing. Two lies in one screen: an invented
 * order, and a literal "Invalid Date" token.
 *
 * The loader-data shape used here (`{ audit: {} }`) is exactly what the browser
 * gets from the client-side server-fn polyfill, so this is the production path,
 * not a contrivance.
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

vi.mock("~/db/queries", () => ({
  getUser: vi.fn(async () => ({ id: "u1", email: "u@example.test" })),
  getAudit: vi.fn(async () => null),
  submitFeedback: vi.fn(async () => ({ success: true })),
}));

import AuditDetail from "../lazy/portal.$auditId.page";
import { formatAuditDate } from "../lazy/portal.$auditId.page";

/** Loader data the page will see — swapped per test. */
let loaderData: { audit: any } = { audit: {} };

function renderAt(id: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>home</div>,
  });
  const portalRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/portal",
    component: () => <div>portal</div>,
  });
  const auditRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/portal/$auditId",
    loader: async () => loaderData,
    component: AuditDetail,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, portalRoute, auditRoute]),
    history: createMemoryHistory({ initialEntries: [`/portal/${id}`] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  cleanup();
  loaderData = { audit: {} };
});

describe("D-9 — an unknown portal path never invents an audit", () => {
  it("renders an honest not-found state and no in-progress / Invalid Date copy", async () => {
    loaderData = { audit: {} }; // what the client-side server-fn polyfill returns
    renderAt("projects");

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /couldn't find that page/i })).toBeInTheDocument(),
    );

    const text = document.body.textContent || "";
    expect(text).not.toContain("Audit in Progress");
    expect(text).not.toContain("Invalid Date");
    expect(text).not.toContain("Request Adjustments");
    // And it offers a way back rather than a dead end.
    expect(screen.getByRole("link", { name: /go to your dashboard/i })).toBeInTheDocument();
  });

  it("a real audit id still renders the audit", async () => {
    loaderData = {
      audit: {
        id: "aud_123",
        type: "Workflow Audit",
        status: "completed",
        results: "Findings go here.",
        createdAt: "2026-11-01T12:00:00.000Z",
        updatedAt: "2026-11-01T13:00:00.000Z",
      },
    };
    renderAt("aud_123");

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Workflow Audit" })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Audit ID: aud_123/)).toBeInTheDocument();
    expect(screen.getByText("Findings go here.")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't find that page/i)).not.toBeInTheDocument();
    expect(document.body.textContent || "").not.toContain("Invalid Date");
  });
});

describe("D-9 — a missing date can never render the literal token", () => {
  it("formatAuditDate returns an em dash for undefined / null / garbage", () => {
    expect(formatAuditDate(undefined)).toBe("—");
    expect(formatAuditDate(null)).toBe("—");
    expect(formatAuditDate("")).toBe("—");
    expect(formatAuditDate("not-a-date")).toBe("—");
    expect(formatAuditDate({})).toBe("—");
  });

  it("formatAuditDate still renders a real date", () => {
    expect(formatAuditDate("2026-11-01T12:00:00.000Z")).not.toBe("—");
    expect(formatAuditDate("2026-11-01T12:00:00.000Z")).not.toContain("Invalid");
  });
});
