import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/tasks/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.tasks.index.page')),
});
