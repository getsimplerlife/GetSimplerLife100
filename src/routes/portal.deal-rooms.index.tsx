import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/deal-rooms/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.deal-rooms.index.page")),
});