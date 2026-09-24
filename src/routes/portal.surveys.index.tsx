import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/surveys/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.surveys.index.page')),
});