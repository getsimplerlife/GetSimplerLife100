import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/proposals/share/$slug")({
  component: lazyRouteComponent(() => import("~/lazy/proposals.share.$slug.page")),
});
