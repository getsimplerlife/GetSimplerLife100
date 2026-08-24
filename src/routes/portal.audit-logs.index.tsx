import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/audit-logs/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.audit-logs.index.page')),
});
