import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";
export const Route = createFileRoute("/you-stay-in-control")({
  head: () => pageHead("/you-stay-in-control"),
  component: lazyRouteComponent(() => import("~/lazy/you-stay-in-control.page")),
});