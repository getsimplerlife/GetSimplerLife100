import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/demos")({
  head: () => pageHead("/demos"),
  component: lazyRouteComponent(() => import('~/lazy/demos.page')),
});
