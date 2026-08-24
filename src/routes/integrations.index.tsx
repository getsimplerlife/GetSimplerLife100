import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/integrations/")({
  head: () => pageHead("/integrations/"),
  component: lazyRouteComponent(() => import('~/lazy/integrations.index.page')),
});
