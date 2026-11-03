import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
/**
 * Public, read-only deal-room page (customer-facing, no login).
 * SLICE 192a — the link only opens for a room the tenant has PUBLISHED
 * (`active`); the server refuses a draft or archived room with a reason, and
 * the page renders that refusal as "this link isn't available".
 * noindex/nofollow — a customer link must never be indexed or enumerable.
 */
export const Route = createFileRoute("/deal-rooms/share/$slug")({
  component: lazyRouteComponent(() => import("~/lazy/deal-rooms.share.$slug.page")),
  head: () => ({
    meta: [
      { title: "Deal room — Simpler Life 100" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
