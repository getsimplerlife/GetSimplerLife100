// @vitest-environment node
// ^ node, not jsdom: the point of this file is that there is NO `window`.
import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import ProposalSharePage from "~/lazy/proposals.share.$slug.page";
import InvoiceSharePage from "~/lazy/invoices.share.$slug.page";
import DealRoomSharePage from "~/lazy/deal-rooms.share.$slug.page";
import SurveyRespondentPage from "~/lazy/surveys.share.$slug.page";

/**
 * SLICE 166 — T2: the three public share pages must render on the server.
 *
 * THE DEFECT THIS PINS (D-3). A customer's proposal / invoice / deal-room link
 * fell back to client rendering because each page read `window.location` while
 * rendering:
 *   - src/lazy/proposals.share.$slug.page.tsx:28  window.location.pathname
 *   - src/lazy/invoices.share.$slug.page.tsx:48-49 window.location.pathname/search
 *   - src/lazy/deal-rooms.share.$slug.page.tsx:37  window.location.pathname
 * On the server `window` is undefined, so SSR threw and the customer got an
 * empty shell until JavaScript downloaded and re-rendered — on the three pages
 * that exist to be opened from an email by someone who is not a user.
 *
 * THE FIX (already in those files): the router knows the params and the search
 * during SSR — `useParams` / `useSearch`, exactly as
 * `src/lazy/bookings.share.$slug.page.tsx:19` has always done.
 *
 * This file renders each page with `renderToString` in a plain Node
 * environment, inside a real router context (a memory router with one route
 * whose component IS the page, at the same path id the page asks for), so the
 * hooks resolve exactly as they do during SSR. A `window` read throws here —
 * which is why this test fails on the pre-fix code.
 *
 * The pages fetch their data in `useEffect`, which does not run during server
 * rendering, so the expected markup is the loading state. That is the honest
 * server output for these routes; what matters is that producing it does not
 * throw.
 */

type AnyComponent = () => ReactElement;

/** Render `component` at `path` in a memory router, in this (window-less) env. */
async function renderRouteAt(
  path: string,
  routePath: string,
  component: AnyComponent,
  validateSearch?: (search: Record<string, unknown>) => Record<string, unknown>,
): Promise<string> {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const pageRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: routePath,
    component,
    ...(validateSearch ? { validateSearch } : {}),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  return renderToString(<RouterProvider router={router} />);
}

const checkoutSearch = (search: Record<string, unknown>) => ({
  checkout: typeof search.checkout === "string" ? search.checkout : undefined,
});

describe("SLICE 166 — public share pages render on the server (no window)", () => {
  it("this environment really has no window (otherwise the test proves nothing)", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it("proposals/share/$slug renders server-side", async () => {
    const html = await renderRouteAt(
      "/proposals/share/x1",
      "/proposals/share/$slug",
      ProposalSharePage as AnyComponent,
    );
    expect(html).toContain("Loading proposal");
  });

  it("invoices/share/$slug renders server-side", async () => {
    const html = await renderRouteAt(
      "/invoices/share/x1",
      "/invoices/share/$slug",
      InvoiceSharePage as AnyComponent,
      checkoutSearch,
    );
    expect(html).toContain("Loading invoice");
  });

  it("invoices/share/$slug renders server-side with the Stripe return flag", async () => {
    // `?checkout=return` is what Stripe's return URL carries; before the fix it
    // was read from `window.location.search` and threw during SSR.
    const html = await renderRouteAt(
      "/invoices/share/x1?checkout=return",
      "/invoices/share/$slug",
      InvoiceSharePage as AnyComponent,
      checkoutSearch,
    );
    expect(html).toContain("Loading invoice");
  });

  it("deal-rooms/share/$slug renders server-side", async () => {
    const html = await renderRouteAt(
      "/deal-rooms/share/x1",
      "/deal-rooms/share/$slug",
      DealRoomSharePage as AnyComponent,
    );
    expect(html).toContain("Loading deal room");
  });

  // SLICE 181 — the survey respondent page is the same class of page: opened
  // from a link by someone who is not a user, on a server that has no `window`.
  it("surveys/share/$slug renders server-side", async () => {
    const html = await renderRouteAt(
      "/surveys/share/abcd1234",
      "/surveys/share/$slug",
      SurveyRespondentPage as AnyComponent,
    );
    expect(html).toContain("Loading survey");
  });
});
