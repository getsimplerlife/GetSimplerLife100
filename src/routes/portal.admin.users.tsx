import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/admin/users")({
  component: lazyRouteComponent(() => import('~/lazy/portal.admin.users.page')),
});
