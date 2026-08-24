import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/reports/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.reports.index.page')),
});
