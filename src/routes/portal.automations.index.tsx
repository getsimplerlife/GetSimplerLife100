import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/automations/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.automations.index.page')),
});