import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/employees/$id")({
  component: lazyRouteComponent(() => import('~/lazy/portal.employees.$id.page')),
});
