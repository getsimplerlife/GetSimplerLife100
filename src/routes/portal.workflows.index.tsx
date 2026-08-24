import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/workflows/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.workflows.index.page')),
});
