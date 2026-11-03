import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/projects/$projectId")({
  component: lazyRouteComponent(() => import("~/lazy/portal.projects.$projectId.page")),
});
