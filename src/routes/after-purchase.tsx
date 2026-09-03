import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";
export const Route = createFileRoute("/after-purchase")({
  head: () => pageHead("/after-purchase"),
  component: lazyRouteComponent(() => import("~/lazy/after-purchase.page")),
});