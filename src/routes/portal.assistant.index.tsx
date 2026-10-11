import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/assistant/")({
  component: lazyRouteComponent(() => import("~/lazy/portal.assistant.index.page")),
});