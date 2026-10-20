import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/accessreview/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.accessreview.index.page")),
});