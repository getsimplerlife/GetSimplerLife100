import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/training/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.training.index.page')),
});
