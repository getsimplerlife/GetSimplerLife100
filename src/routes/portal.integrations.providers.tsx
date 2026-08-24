import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/integrations/providers")({
  component: lazyRouteComponent(() => import('~/lazy/portal.integrations.providers.page')),
});
