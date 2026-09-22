import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/bookings/share/$slug")({
  component: lazyRouteComponent(() => import('~/lazy/bookings.share.$slug.page')),
});
