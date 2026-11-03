import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/clients/$clientId")({
  component: lazyRouteComponent(() => import("~/lazy/portal.clients.$clientId.page")),
});
