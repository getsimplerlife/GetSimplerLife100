import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/erp/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.erp.index.page')),
});
