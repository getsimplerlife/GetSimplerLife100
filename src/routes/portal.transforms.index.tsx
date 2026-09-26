import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/transforms/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.transforms.index.page')),
});