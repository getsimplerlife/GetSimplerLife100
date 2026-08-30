import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute("/industries/")({
  head: () => pageHead("/industries"),
  loader: () => import("~/lazy/industries.index.page").then(m => m.getPageData()),
  component: lazyRouteComponent(() => import("~/lazy/industries.index.page")),
});
