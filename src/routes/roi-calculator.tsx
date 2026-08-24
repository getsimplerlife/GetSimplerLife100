import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/roi-calculator")({
  head: () => pageHead("/roi-calculator"),
  component: lazyRouteComponent(() => import('~/lazy/roi-calculator.page')),
});
