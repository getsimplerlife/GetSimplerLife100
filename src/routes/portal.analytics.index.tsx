import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/analytics/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.analytics.index.page')),
});
