import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PortalEmptyState } from "~/components/PortalEmptyState";
import { matchesRoute, routePaths } from "./helpers/route-tree";
import { mockFetch, urlHas } from "./helpers/portal-primitive-fetch";
import InvoicesPage from "../lazy/portal.invoices.index.page";

// The router Link is exercised in production (billing); in jsdom we render a
// plain anchor so the CTA shape can be asserted without a RouterProvider.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PortalEmptyState (P1-3 designed empty state)", () => {
  it("renders the title and body copy", () => {
    render(<PortalEmptyState title="No proposals yet" body="Draft your first proposal above." />);
    expect(screen.getByText("No proposals yet")).toBeInTheDocument();
    expect(screen.getByText("Draft your first proposal above.")).toBeInTheDocument();
  });

  // SLICE 171 — this assertion used to read
  //   expect(link).toHaveAttribute("href", "/deal-rooms/")
  // which is not a route: deal rooms live under the /portal layout, at
  // /portal/deal-rooms. The test was written to match the bug, so it stayed
  // green while every new customer's "no invoices yet" button 404'd. It now
  // checks the target against the REAL route tree, so it cannot encode a path
  // the router cannot serve.
  it("renders a router-link CTA when action.to is given, at a route that exists", () => {
    const routes = routePaths();
    expect(routes.size).toBeGreaterThan(50); // guard: never a silent no-op
    const target = "/portal/deal-rooms";
    expect(matchesRoute(target, routes), `${target} is not a route`).toBe(true);

    render(<PortalEmptyState title="No invoices yet" action={{ label: "Open deal rooms", to: target }} />);
    const link = screen.getByRole("link", { name: /Open deal rooms/ });
    const href = link.getAttribute("href") ?? "";
    expect(matchesRoute(href, routes), `CTA target "${href}" resolves to no route`).toBe(true);
    expect(href).toBe(target);
  });

  it("renders an anchor CTA when action.href is given", () => {
    render(<PortalEmptyState title="Title" action={{ label: "External case study", href: "https://example.com" }} />);
    const link = screen.getByRole("link", { name: /External case study/ });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders a button CTA when action.onClick is given and fires it", () => {
    const onClick = vi.fn();
    render(<PortalEmptyState title="Title" action={{ label: "Open the composer", onClick }} />);
    const btn = screen.getByRole("button", { name: /Open the composer/ });
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders no CTA when no action is given", () => {
    const { container } = render(<PortalEmptyState title="Title" />);
    expect(container.querySelector("a, button")).toBeNull();
  });

  it("renders the icon when provided", () => {
    render(<PortalEmptyState icon="📭" title="No inbox items matched" />);
    expect(screen.getByText("📭")).toBeInTheDocument();
  });

  it("renders in the designed (non-compact) and compact variants", () => {
    const full = render(<PortalEmptyState title="No proposals yet" />);
    expect(full.container.firstChild).toHaveClass("py-12");
    expect(full.container.firstChild).not.toHaveClass("py-8");
    full.unmount();
    const compact = render(<PortalEmptyState compact title="No clients yet" />);
    expect(compact.container.firstChild).toHaveClass("py-8");
    expect(compact.container.firstChild).not.toHaveClass("py-12");
    expect(compact.container.firstChild).toHaveClass("border-dashed");
  });
});

/**
 * SLICE 171 — the page-level pin, and the one that would actually have caught
 * D-B1. The block above tests PortalEmptyState with a target the test chose;
 * this renders the REAL invoices page in its REAL empty state (no invoices, no
 * active deal rooms) and checks the CTA the customer is offered.
 */
describe("invoices empty state (slice 171 — D-B1)", () => {
  function renderInvoicesEmpty() {
    mockFetch([
      { match: urlHas("/api/native/invoice/writes"), body: { data: [] } },
      { match: urlHas("/api/native/invoice/stripe"), body: { data: { connected: false } } },
      { match: urlHas("/api/native/invoice"), body: { data: [] } },
      { match: urlHas("/api/native/dealroom"), body: { data: [] } },
    ]);
    return render(<InvoicesPage />);
  }

  it("offers a deal-rooms CTA that resolves to a real route", async () => {
    const routes = routePaths();
    expect(routes.size).toBeGreaterThan(50);

    renderInvoicesEmpty();
    const link = await screen.findByRole("link", { name: /Open deal rooms/ });
    const href = link.getAttribute("href") ?? "";

    expect(href.length).toBeGreaterThan(0);
    expect(matchesRoute(href, routes), `invoices empty-state CTA "${href}" resolves to no route`).toBe(true);
    expect(href).toBe("/portal/deal-rooms");
  });

  it("does not offer the parent-relative /deal-rooms path the router cannot serve", () => {
    const routes = routePaths();
    // /deal-rooms/ is the deal-rooms route's path RELATIVE TO the /portal
    // layout. As a top-level URL it 404s, which is exactly what Sweep B hit.
    expect(matchesRoute("/deal-rooms/", routes)).toBe(false);
    expect(matchesRoute("/portal/deal-rooms/", routes)).toBe(true);
  });
});
