import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/demo")({
  head: () => pageHead("/demo"),
  component: lazyRouteComponent(() => import('~/lazy/demo.page')),
});
