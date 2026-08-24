import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";

export const Route = createFileRoute('/case-studies/$caseStudyId')({
  head: () => pageHead("/case-studies"),
  component: lazyRouteComponent(() => import('~/lazy/case-studies.$caseStudyId.page')),
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">Case study not found</div>,
});
