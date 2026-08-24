import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/tools/")({
  head: () => pageHead("/tools/"),
  component: lazyRouteComponent(() => import('~/lazy/tools.index.page')),
});
