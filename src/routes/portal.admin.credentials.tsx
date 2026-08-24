import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/admin/credentials")({
  component: lazyRouteComponent(() => import('~/lazy/portal.admin.credentials.page')),
});
