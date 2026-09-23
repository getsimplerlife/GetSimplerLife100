import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/bookings/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.bookings.index.page')),
});