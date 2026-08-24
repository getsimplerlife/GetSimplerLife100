import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/connected-accounts/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.connected-accounts.index.page')),
});
