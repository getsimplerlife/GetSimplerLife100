import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/employees/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.employees.index.page')),
});
