import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/vault/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.vault.index.page')),
});