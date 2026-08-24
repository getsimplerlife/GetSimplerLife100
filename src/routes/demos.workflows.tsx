import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/demos/workflows")({
  head: () => pageHead("/demos/workflows"),
  component: lazyRouteComponent(() => import('~/lazy/demos.workflows.page')),
});
