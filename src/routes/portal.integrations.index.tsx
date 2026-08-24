import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/integrations/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.integrations.index.page')),
});
