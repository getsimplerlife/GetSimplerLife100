import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/customers/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.customers.index.page')),
});
