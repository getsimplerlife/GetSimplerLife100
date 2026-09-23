import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/boards/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.boards.index.page')),
});