import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { PortalEmptyState } from "~/components/PortalEmptyState";

// The router Link is exercised in production (billing); in jsdom we render a
// plain anchor so the CTA shape can be asserted without a RouterProvider.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

describe("PortalEmptyState (P1-3 designed empty state)", () => {
  it("renders the title and body copy", () => {
    render(<PortalEmptyState title="No proposals yet" body="Draft your first proposal above." />);
    expect(screen.getByText("No proposals yet")).toBeInTheDocument();
    expect(screen.getByText("Draft your first proposal above.")).toBeInTheDocument();
  });

  it("renders a router-link CTA when action.to is given", () => {
    render(
      <PortalEmptyState title="No invoices yet" action={{ label: "Open deal rooms", to: "/deal-rooms/" }} />,
    );
    const link = screen.getByRole("link", { name: /Open deal rooms/ });
    expect(link).toHaveAttribute("href", "/deal-rooms/");
  });

  it("renders an anchor CTA when action.href is given", () => {
    render(
      <PortalEmptyState title="Title" action={{ label: "External case study", href: "https://example.com" }} />,
    );
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