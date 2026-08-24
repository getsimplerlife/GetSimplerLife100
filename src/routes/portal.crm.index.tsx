import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/crm/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.crm.index.page')),
});
