import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/build")({
  head: () => pageHead("/build"),
  component: lazyRouteComponent(() => import('~/lazy/build.page')),
});
