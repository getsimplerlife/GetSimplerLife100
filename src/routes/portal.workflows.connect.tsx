import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/workflows/connect")({
  component: lazyRouteComponent(() => import('~/lazy/portal.workflows.connect.page')),
});
