import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/surveys/share/$slug")({
  component: lazyRouteComponent(() => import("~/lazy/surveys.share.$slug.page")),
});
