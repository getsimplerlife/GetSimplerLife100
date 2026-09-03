import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";
export const Route = createFileRoute("/security")({
  head: () => pageHead("/security"),
  component: lazyRouteComponent(() => import("~/lazy/security.page")),
});