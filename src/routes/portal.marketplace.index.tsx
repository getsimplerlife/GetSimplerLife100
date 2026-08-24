import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/marketplace/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.marketplace.index.page')),
});
