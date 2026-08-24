import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/integrations/$id")({
  component: lazyRouteComponent(() => import('~/lazy/portal.integrations.$id.page')),
});
