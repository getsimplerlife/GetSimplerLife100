import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/invoices/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.invoices.index.page")),
});