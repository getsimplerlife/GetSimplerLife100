import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/tools/ai-advisor")({
  head: () => pageHead("/tools/ai-advisor"),
  component: lazyRouteComponent(() => import('~/lazy/tools.ai-advisor.page')),
});
