import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

/**
 * Public, read-only invoice page (customer-facing, no login).
 * Signed-slug gated: the page renders only what
 * /api/native/invoice/share/:slug returns for a genuinely SENT invoice.
 * noindex/nofollow — a customer link must never be indexed or enumerable.
 */
export const Route = createFileRoute("/invoices/share/$slug")({
  component: lazyRouteComponent(() => import("~/lazy/invoices.share.$slug.page")),
  head: () => ({
    meta: [
      { title: "Invoice — Simpler Life 100" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
