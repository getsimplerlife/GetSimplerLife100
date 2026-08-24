import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/admin/health")({
  component: lazyRouteComponent(() => import('~/lazy/portal.admin.health.page')),
});
