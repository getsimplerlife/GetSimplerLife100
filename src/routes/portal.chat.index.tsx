import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/chat/")({
  component: lazyRouteComponent(() => import('~/lazy/portal.chat.index.page')),
});
