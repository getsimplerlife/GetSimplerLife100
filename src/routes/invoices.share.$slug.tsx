import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
/**
 * Public, read-only invoice page (customer-facing, no login).
 * Signed-slug gated: the page renders only what
 * /api/native/invoice/share/:slug returns for a genuinely SENT invoice.
 * noindex/nofollow — a customer link must never be indexed or enumerable.
 */
export const Route = createFileRoute("/invoices/share/$slug")({
  // SLICE 166 — `?checkout=return|cancelled` is the flag Stripe's return URL
  // carries back. Declaring it here lets the page read it with `useSearch`
  // instead of `window.location.search`, which threw during server rendering.
  validateSearch: (search: Record<string, unknown>): { checkout?: string } => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
  }),
  component: lazyRouteComponent(() => import("~/lazy/invoices.share.$slug.page")),
  head: () => ({
    meta: [
      { title: "Invoice — Simpler Life 100" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
