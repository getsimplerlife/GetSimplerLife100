import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/settings/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.settings.index.page')),
});
