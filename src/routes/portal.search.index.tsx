import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/search/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.search.index.page')),
});