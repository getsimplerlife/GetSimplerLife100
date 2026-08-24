import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/industries/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.industries.index.page')),
});
