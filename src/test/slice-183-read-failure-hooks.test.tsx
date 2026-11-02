/**
 * SLICE 183 — the read-failure class, page side.
 *
 * THE DEFECT THIS PINS. `src/lib/portal-dashboard.ts` and
 * `src/lib/portal-search.ts` hand-rolled `fetch` and coalesced with `|| []`, so
 * a 401, a 500 and a genuinely empty store all became "zero rows". Three portal
 * routes therefore rendered a broken store as an EMPTY workspace:
 *
 *     /portal/analytics   "No activity yet in this workspace"
 *     /portal/tasks       "No task or workflow run records yet"
 *     /portal/search      "Nothing to search yet"
 *     /portal             (Activity Hub — zeros with no notice)
 *
 * Both libs now read through `authedJson` (portal-primitives.ts) and expose
 * `loaded` (true only when EVERY read returned 2xx) and `readError` (the
 * server's own sentence + the endpoints that failed).
 *
 * WHAT THIS FILE PROVES — both halves, because gating the empty state on a 2xx
 * must not DELETE it:
 *   A. a failed read renders an error and NO empty state;
 *   B. a 2xx with zero rows still renders the honest empty state.
 *
 * No assertion here restates copy the component supplies. The failure sentence
 * is a sentinel only the mocked response carries (so it can only appear on the
 * page if the page prints the SERVER's message), and "an empty state rendered"
 * is detected structurally (PortalEmptyState's own dashed container) rather
 * than by matching its title text.
 */
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  DASHBOARD_SOURCES,
  usePortalDashboard,
  deriveDashboard,
} from "../lib/portal-dashboard";
import { SEARCH_SOURCES, usePortalGlobalSearch, buildSearchIndex } from "../lib/portal-search";
import AnalyticsPage from "../lazy/portal.analytics.index.page";
import TasksPage from "../lazy/portal.tasks.index.page";
import SearchPage from "../lazy/portal.search.index.page";
import { mockFetch, urlIs } from "./helpers/portal-primitive-fetch";

// The pages link through the router; in jsdom there is no router, so Link
// renders as a plain anchor (slice-175 / slice-178 precedent).
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children?: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A sentence only the mocked response carries — it can reach the DOM only if
 *  the page prints the SERVER's own message. */
const SERVER_SENTENCE = "probe-183: the workspace store could not be read";

/** Every source answers the same way (200 or a failure), in call order. */
function everySource(sources: readonly string[], status: number, body: unknown) {
  return sources.map((url) => ({ match: urlIs(url), status, body }));
}

/** One source fails with the sentinel; every other source is a healthy 200. */
function oneFailingSource(failing: string) {
  return [
    { match: urlIs(failing), status: 500, body: { error: SERVER_SENTENCE } },
    { match: () => true, status: 200, body: { data: [] } },
  ];
}

/** PortalEmptyState's dashed container — the structural marker of an empty
 *  state, independent of the copy it happens to carry. */
function emptyStateNodes(container: HTMLElement): number {
  return container.querySelectorAll(".border-dashed").length;
}

// ── A probe that reports the hook's own state (lib-level assertions) ─────────

function DashboardProbe() {
  const state = usePortalDashboard(600_000);
  const d = deriveDashboard(state.inputs);
  return (
    <div>
      <span data-testid="loaded">{String(state.loaded)}</span>
      <span data-testid="signed-out">{String(state.signedOut)}</span>
      <span data-testid="read-error">{state.readError?.error ?? "NONE"}</span>
      <span data-testid="sources">{(state.readError?.sources ?? []).join(",")}</span>
      <span data-testid="is-empty">{String(d.isEmpty)}</span>
    </div>
  );
}

function SearchProbe() {
  const state = usePortalGlobalSearch(600_000);
  return (
    <div>
      <span data-testid="loaded">{String(state.loaded)}</span>
      <span data-testid="signed-out">{String(state.signedOut)}</span>
      <span data-testid="read-error">{state.readError?.error ?? "NONE"}</span>
      <span data-testid="sources">{(state.readError?.sources ?? []).join(",")}</span>
      <span data-testid="entries">{String(buildSearchIndex(state.inputs).length)}</span>
    </div>
  );
}

describe("slice 183 — usePortalDashboard reports a failed read instead of zero rows", () => {
  it("A. one 500 carries the server's sentence and names the source; loaded is false", async () => {
    mockFetch(oneFailingSource("/api/data/tasks"));
    render(<DashboardProbe />);
    await waitFor(() => expect(screen.getByTestId("loaded")).toHaveTextContent("false"));
    expect(screen.getByTestId("read-error")).toHaveTextContent(SERVER_SENTENCE);
    expect(screen.getByTestId("sources")).toHaveTextContent("/api/data/tasks");
    expect(screen.getByTestId("signed-out")).toHaveTextContent("false");
  });

  it("A. every read 401 is a SIGNED-OUT state, not a read error", async () => {
    mockFetch(everySource(DASHBOARD_SOURCES, 401, { error: "Not authenticated" }));
    render(<DashboardProbe />);
    await waitFor(() => expect(screen.getByTestId("signed-out")).toHaveTextContent("true"));
    expect(screen.getByTestId("loaded")).toHaveTextContent("false");
    expect(screen.getByTestId("read-error")).toHaveTextContent("NONE");
  });

  it("B. every read 2xx with zero rows is loaded=true, no error, and IS empty", async () => {
    mockFetch(everySource(DASHBOARD_SOURCES, 200, { data: [] }));
    render(<DashboardProbe />);
    await waitFor(() => expect(screen.getByTestId("loaded")).toHaveTextContent("true"));
    expect(screen.getByTestId("read-error")).toHaveTextContent("NONE");
    expect(screen.getByTestId("is-empty")).toHaveTextContent("true");
  });
});

describe("slice 183 — usePortalGlobalSearch reports a failed read instead of an empty index", () => {
  it("A. one 500 carries the server's sentence and names the source", async () => {
    mockFetch(oneFailingSource("/api/data/reports"));
    render(<SearchProbe />);
    await waitFor(() => expect(screen.getByTestId("loaded")).toHaveTextContent("false"));
    expect(screen.getByTestId("read-error")).toHaveTextContent(SERVER_SENTENCE);
    expect(screen.getByTestId("sources")).toHaveTextContent("/api/data/reports");
  });

  it("B. every read 2xx with zero rows is loaded=true with an empty index", async () => {
    mockFetch(everySource(SEARCH_SOURCES, 200, { data: [] }));
    render(<SearchProbe />);
    await waitFor(() => expect(screen.getByTestId("loaded")).toHaveTextContent("true"));
    expect(screen.getByTestId("read-error")).toHaveTextContent("NONE");
    expect(screen.getByTestId("entries")).toHaveTextContent("0");
  });
});

// ── The pages themselves: error state XOR empty state ────────────────────────

describe("slice 183 — /portal/analytics", () => {
  it("A. a failed read renders an error and NO empty state", async () => {
    mockFetch(everySource(DASHBOARD_SOURCES, 500, { error: SERVER_SENTENCE }));
    const { container } = render(<AnalyticsPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert")).toHaveTextContent(SERVER_SENTENCE);
    expect(emptyStateNodes(container), "an empty state must not render over a failed read").toBe(0);
  });

  it("B. a 2xx with zero rows still renders the honest empty state", async () => {
    mockFetch(everySource(DASHBOARD_SOURCES, 200, { data: [] }));
    const { container } = render(<AnalyticsPage />);
    await waitFor(() => expect(emptyStateNodes(container)).toBeGreaterThan(0));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("slice 183 — /portal/tasks", () => {
  it("A. a failed read renders an error and NO empty state", async () => {
    mockFetch(everySource(DASHBOARD_SOURCES, 500, { error: SERVER_SENTENCE }));
    const { container } = render(<TasksPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert")).toHaveTextContent(SERVER_SENTENCE);
    expect(emptyStateNodes(container), "an empty state must not render over a failed read").toBe(0);
  });

  it("B. a 2xx with zero rows still renders the honest empty state", async () => {
    mockFetch(everySource(DASHBOARD_SOURCES, 200, { data: [] }));
    const { container } = render(<TasksPage />);
    await waitFor(() => expect(emptyStateNodes(container)).toBeGreaterThan(0));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("slice 183 — /portal/search", () => {
  it("A. a failed read renders an error and NO empty state", async () => {
    mockFetch(everySource(SEARCH_SOURCES, 500, { error: SERVER_SENTENCE }));
    const { container } = render(<SearchPage />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert")).toHaveTextContent(SERVER_SENTENCE);
    expect(emptyStateNodes(container), "an empty state must not render over a failed read").toBe(0);
  });

  it("B. a 2xx with zero rows still renders the honest empty state", async () => {
    mockFetch(everySource(SEARCH_SOURCES, 200, { data: [] }));
    const { container } = render(<SearchPage />);
    await waitFor(() => expect(emptyStateNodes(container)).toBeGreaterThan(0));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
