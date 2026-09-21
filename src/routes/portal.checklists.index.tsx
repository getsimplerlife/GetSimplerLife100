import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/checklists/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.checklists.index.page")),
});