import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/dedupe/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.dedupe.index.page")),
});