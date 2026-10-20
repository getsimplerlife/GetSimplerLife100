import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/knowledgebase/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.knowledgebase.index.page")),
});