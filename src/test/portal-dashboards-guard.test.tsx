/**
 * portal-dashboards-guard.test.tsx — slice 135 guard for the DASHBOARDS page.
 *
 *   1. ROUTE RENDERS — lazy route exists, mounts this page, page renders.
 *   2. EMPTY STATE IS HONEST — "No dashboards yet" + the report-builder action.
 *   3. UNAUTHENTICATED IS NOT DATA — 401 → sign-in state, never the empty state.
 *
 * Plus the no-fake-chart rule: a widget whose report has never run says so and
 * draws nothing. Widget data comes only from a durable run's rows.
 */
import type { ReactNode } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import DashboardsPage from "../lazy/portal.dashboards.index.page";
import { mockFetch, mockSignedOut, hasText, urlIs } from "./helpers/portal-primitive-fetch";

// The report-builder empty state links to /portal/tables; in jsdom there is no
// router, so Link renders as a plain anchor (portal-empty-state.test.tsx
// precedent).
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const ROUTE_FILE = "src/routes/portal.dashboards.index.tsx";
const PAGE_FILE = "src/lazy/portal.dashboards.index.page.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

const emptyPayloads = [
  { match: urlIs("/api/native/dashboard/reports"), body: { data: { reports: [] } } },
  { match: urlIs("/api/native/dashboard/writes"), body: { data: { writes: [] } } },
  { match: urlIs("/api/native/dashboard/schedules"), body: { data: { schedules: [] } } },
  { match: urlIs("/api/native/dashboard/alerts"), body: { data: { rules: [], records: [] } } },
  { match: urlIs("/api/native/dashboard"), body: { data: { dashboards: [] } } },
  { match: urlIs("/api/native/tables"), body: { data: { tables: [] } } },
];

const widget = {
  id: "rpt_1",
  name: "Revenue by region",
  description: "",
  sourceTableId: "tbl_1",
  viz: "bar",
  agg: "sum",
  groupBy: "region",
  valueField: "amount",
  sortDir: "desc",
  limit: 100,
  version: 1,
  runCount: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};
const dashboard = {
  id: "dsh_1",
  name: "Weekly ops",
  description: "",
  widgetCount: 1,
  version: 1,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

describe("dashboards page — route wiring", () => {
  it("has a lazy route file that mounts this page", () => {
    expect(existsSync(ROUTE_FILE)).toBe(true);
    const src = readFileSync(ROUTE_FILE, "utf8");
    expect(src).toContain('createFileRoute("/portal/dashboards/")');
    expect(src).toContain("~/lazy/portal.dashboards.index.page");
  });

  it("renders its heading from an empty tenant payload", async () => {
    mockFetch(emptyPayloads);
    render(<DashboardsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Dashboards" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Your dashboards (0)")).toBeInTheDocument());
  });
});

describe("dashboards page — honest empty state", () => {
  it("says 'No dashboards yet' and points at the report builder", async () => {
    mockFetch(emptyPayloads);
    render(<DashboardsPage />);
    await waitFor(() => expect(screen.getByText("No dashboards yet")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Open the report builder/ })).toBeInTheDocument();
  });

  it("says there is nothing to report on when the tenant has no tables", async () => {
    mockFetch(emptyPayloads);
    render(<DashboardsPage />);
    await waitFor(() => expect(screen.getByText("No tables to report on yet")).toBeInTheDocument());
  });
});

describe("dashboards page — no fake charts", () => {
  it("a widget whose report never ran says so and draws no bars", async () => {
    mockFetch([
      { match: urlIs("/api/native/dashboard/reports/rpt_1/runs"), body: { data: { runs: [] } } },
      { match: urlIs("/api/native/dashboard/dsh_1"), body: { data: { dashboard: { ...dashboard, widgets: [widget] } } } },
      { match: urlIs("/api/native/dashboard/reports"), body: { data: { reports: [widget] } } },
      { match: urlIs("/api/native/dashboard/writes"), body: { data: { writes: [] } } },
      { match: urlIs("/api/native/dashboard/schedules"), body: { data: { schedules: [] } } },
      { match: urlIs("/api/native/dashboard/alerts"), body: { data: { rules: [], records: [] } } },
      { match: urlIs("/api/native/dashboard"), body: { data: { dashboards: [dashboard] } } },
      { match: urlIs("/api/native/tables"), body: { data: { tables: [] } } },
    ]);
    const { container } = render(<DashboardsPage />);
    await waitFor(() => expect(screen.getByText(hasText("Your dashboards (1)"))).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByText(/Not computed yet/)).toBeInTheDocument());
    expect(container.querySelectorAll(".bg-emerald-500").length).toBe(0);
  });
});

describe("dashboards page — unauthenticated is not silently rendered as data", () => {
  it("a 401 shows the sign-in state and never the empty state", async () => {
    mockSignedOut();
    render(<DashboardsPage />);
    await waitFor(() => expect(screen.getByText("Please sign in to continue")).toBeInTheDocument());
    expect(screen.queryByText("No dashboards yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/Your dashboards \(/)).not.toBeInTheDocument();
  });
});

describe("dashboards page — reads only real routes and states its rendering limits", () => {
  const src = readFileSync(PAGE_FILE, "utf8");

  it("uses the real dashboard family", () => {
    for (const fragment of [
      "/api/native/dashboard",
      "/reports",
      "/runs",
      "/writes",
      "/schedules",
      "/alerts",
    ]) {
      expect(src).toContain(fragment);
    }
  });

  it("states that a 'line' widget is an ordered series, not a plotted line", () => {
    expect(src).toContain("not plotted as a line");
    expect(src).toContain("no time axis");
  });
});
