import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/projects/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.projects.index.page")),
});
