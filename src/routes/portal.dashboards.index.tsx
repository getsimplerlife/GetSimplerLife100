import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/dashboards/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.dashboards.index.page')),
});