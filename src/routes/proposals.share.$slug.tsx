import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

/**
 * Public, read-only proposal page (customer-facing, no login).
 * Slug-gated: the page renders only what /api/native/proposals/share/:slug
 * returns for a proposal that has been issued to the client.
 * noindex/nofollow — a customer link must never be indexed or enumerable
 * (the same rule as routes/invoices.share.$slug.tsx).
 */
export const Route = createFileRoute("/proposals/share/$slug")({
  component: lazyRouteComponent(() => import("~/lazy/proposals.share.$slug.page")),
  head: () => ({
    meta: [
      { title: "Proposal — Simpler Life 100" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
