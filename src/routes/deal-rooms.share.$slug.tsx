import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/deal-rooms/share/$slug")({
  component: lazyRouteComponent(() => import("~/lazy/deal-rooms.share.$slug.page")),
});
