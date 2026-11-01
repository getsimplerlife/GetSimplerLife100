import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

/**
 * SLICE 162 — owner-only data-health view. The data comes from the owner-gated
 * `GET /api/admin/data-health`; this route only renders it, and the admin
 * layout above it already refuses anyone who is not the owner.
 */
export const Route = createFileRoute("/portal/admin/data-health")({
  component: lazyRouteComponent(() => import("~/lazy/portal.admin.data-health.page")),
});
