import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/portal/")({
  // SLICE 168 — D-10: the admin panel's bounce carries its reason here, so the
  // dashboard can say in words why the visitor was sent back. Declaring it
  // keeps the param typed and stops the router stripping it.
  validateSearch: (search: Record<string, unknown>): { notice?: string } => ({
    notice: typeof search.notice === "string" ? search.notice : undefined,
  }),
  component: lazyRouteComponent(() => import('~/lazy/portal.index.page')),
});
