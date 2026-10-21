import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/import/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.import.index.page")),
});