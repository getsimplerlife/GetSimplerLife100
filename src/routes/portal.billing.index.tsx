import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/billing/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.billing.index.page')),
});
