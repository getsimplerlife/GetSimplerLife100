import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('/integrations/$integrationId')({
  head: () => pageHead("/integrations"),
  component: lazyRouteComponent(() => import('~/lazy/integrations.$integrationId.page')),
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">Integration not found</div>,
});
