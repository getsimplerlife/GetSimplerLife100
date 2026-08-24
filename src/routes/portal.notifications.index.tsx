import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/notifications/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.notifications.index.page')),
});
