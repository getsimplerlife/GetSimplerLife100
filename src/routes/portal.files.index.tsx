import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/files/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.files.index.page')),
});
