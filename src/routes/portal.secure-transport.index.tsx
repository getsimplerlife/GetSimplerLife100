import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/secure-transport/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.secure-transport.index.page")),
});