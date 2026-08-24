import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/api/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.api.index.page')),
});
