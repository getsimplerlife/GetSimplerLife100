import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

/**
 * Public booking page (customer-facing, no login).
 * Slug-gated: the page renders only what /api/native/booking/share/:slug
 * returns for a PUBLISHED page.
 * noindex/nofollow — a customer link must never be indexed or enumerable
 * (the same rule as routes/invoices.share.$slug.tsx).
 */
export const Route = createFileRoute("/bookings/share/$slug")({
  component: lazyRouteComponent(() => import("~/lazy/bookings.share.$slug.page")),
  head: () => ({
    meta: [
      { title: "Book a time — Simpler Life 100" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
