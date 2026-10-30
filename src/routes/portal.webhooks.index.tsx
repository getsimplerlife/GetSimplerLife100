import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/webhooks/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.webhooks.index.page')),
});
