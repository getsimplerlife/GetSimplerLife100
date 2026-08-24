import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/case-studies/")({
  head: () => pageHead("/case-studies/"),
  component: lazyRouteComponent(() => import('~/lazy/case-studies.index.page')),
});
