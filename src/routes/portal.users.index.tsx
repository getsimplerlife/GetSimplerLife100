import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/users/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.users.index.page')),
});
