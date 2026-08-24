import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/documents/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.documents.index.page')),
});
