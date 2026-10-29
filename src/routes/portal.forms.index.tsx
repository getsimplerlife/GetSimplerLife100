import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/forms/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.forms.index.page')),
});
