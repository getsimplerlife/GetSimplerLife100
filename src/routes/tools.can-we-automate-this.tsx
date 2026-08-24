import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/tools/can-we-automate-this")({
  head: () => pageHead("/tools/can-we-automate-this"),
  component: lazyRouteComponent(() => import('~/lazy/tools.can-we-automate-this.page')),
});
