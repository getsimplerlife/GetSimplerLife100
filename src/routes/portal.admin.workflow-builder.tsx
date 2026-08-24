import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/admin/workflow-builder")({
  component: lazyRouteComponent(() => import('~/lazy/portal.admin.workflow-builder.page')),
});
