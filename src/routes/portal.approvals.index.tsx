import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/approvals/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.approvals.index.page')),
});
