import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/proposals/$proposalId")({
  component: lazyRouteComponent(() => import("~/lazy/portal.proposals.$proposalId.page")),
});
