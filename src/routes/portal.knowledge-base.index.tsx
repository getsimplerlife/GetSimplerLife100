import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/knowledge-base/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.knowledge-base.index.page')),
});
