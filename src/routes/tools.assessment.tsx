import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/tools/assessment")({
  head: () => pageHead("/tools/assessment"),
  component: lazyRouteComponent(() => import('~/lazy/tools.assessment.page')),
});
