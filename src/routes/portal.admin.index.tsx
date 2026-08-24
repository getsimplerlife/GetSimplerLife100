import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/admin/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.admin.index.page')),
});
