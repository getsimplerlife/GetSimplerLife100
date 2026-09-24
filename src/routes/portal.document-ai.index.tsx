import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/document-ai/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.document-ai.index.page')),
});