import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/tables/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.tables.index.page')),
});
