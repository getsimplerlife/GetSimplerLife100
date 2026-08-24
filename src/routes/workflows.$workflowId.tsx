import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('/workflows/$workflowId')({
  head: () => pageHead("/workflows"),
  component: lazyRouteComponent(() => import('~/lazy/workflows.$workflowId.page')),
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">Workflow not found</div>,
});
