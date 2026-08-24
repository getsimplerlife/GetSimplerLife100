import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/admin/analytics")({
  component: lazyRouteComponent(() => import('~/lazy/portal.admin.analytics.page')),
});
