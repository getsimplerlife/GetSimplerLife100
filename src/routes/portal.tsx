import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal")({
  component: lazyRouteComponent(() => import('~/lazy/portal.page')),
});
