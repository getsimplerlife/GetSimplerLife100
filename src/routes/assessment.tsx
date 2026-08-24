import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/assessment")({
  head: () => pageHead("/assessment"),
  component: lazyRouteComponent(() => import('~/lazy/assessment.page')),
});
