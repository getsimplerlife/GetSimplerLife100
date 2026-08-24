import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('/industries/$industryId')({
  head: () => pageHead("/industries"),
  component: lazyRouteComponent(() => import('~/lazy/industries.$industryId.page')),
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">Industry not found</div>,
});
