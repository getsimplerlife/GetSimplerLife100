import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/admin/audit")({
  component: lazyRouteComponent(() => import('~/lazy/portal.admin.audit.page')),
});
