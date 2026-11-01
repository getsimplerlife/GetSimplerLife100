import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

/**
 * SLICE 159 — owner-only page counter view. The data comes from the
 * owner-gated `GET /api/admin/page-views`; this route only renders it, and the
 * admin layout above it already refuses anyone who is not the owner.
 */
export const Route = createFileRoute("/portal/admin/page-views")({
  component: lazyRouteComponent(() => import('~/lazy/portal.admin.page-views.page')),
});
