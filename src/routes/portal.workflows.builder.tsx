import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/workflows/builder")({
  component: lazyRouteComponent(() => import('~/lazy/portal.workflows.builder.page')),
});
