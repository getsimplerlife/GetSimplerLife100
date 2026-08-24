import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/workflows/")({
  head: () => pageHead("/workflows/"),
  component: lazyRouteComponent(() => import('~/lazy/workflows.index.page')),
});
