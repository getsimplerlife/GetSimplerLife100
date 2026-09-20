import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/proposals/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.proposals.index.page")),
});