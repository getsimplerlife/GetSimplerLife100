import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/communications/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.communications.index.page')),
});
