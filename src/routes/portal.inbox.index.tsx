import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/inbox/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.inbox.index.page')),
});
