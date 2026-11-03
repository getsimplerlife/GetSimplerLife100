import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/clients/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.clients.index.page")),
});
