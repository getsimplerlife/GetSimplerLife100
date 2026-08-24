import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/demos/audit-portal")({
  head: () => pageHead("/demos/audit-portal"),
  component: lazyRouteComponent(() => import('~/lazy/demos.audit-portal.page')),
});
