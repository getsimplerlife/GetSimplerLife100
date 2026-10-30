import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
import { pageHead } from "~/lib/site-meta";
import { caseStudies } from "~/content/case-studies";

export const Route = createFileRoute('/case-studies/$caseStudyId')({
  // Fail-closed: an id that is not a real demonstration is a 404, never a
  // half-empty page. A retired entry is gone from the content, so its old URL
  // stops rendering instead of showing an empty detail page.
  loader: ({ params }) => {
    const found = caseStudies.find((cs) => cs.id === params.caseStudyId);
    if (!found) throw notFound();
    return { id: found.id };
  },
  head: () => pageHead("/case-studies"),
  component: lazyRouteComponent(() => import('~/lazy/case-studies.$caseStudyId.page')),
  notFoundComponent: () => <div className="text-center py-20 text-stone-400">Case study not found</div>,
});
