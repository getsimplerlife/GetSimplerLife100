import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

/**
 * Public, respondent-facing survey page (no login).
 *
 * SLICE 205 — `noindex, nofollow` (audit 204 D-3). A survey link is a private
 * client link: it carries the host's questions and, once answered, the
 * respondent's answers. It was the ONLY one of the five share routes with no
 * robots directive — confirmed three ways in the browser audit (served HTML,
 * response headers, live DOM). The other four set it in `head()`:
 * `invoices.share.$slug.tsx:19`, `deal-rooms.share.$slug.tsx:14`,
 * `proposals.share.$slug.tsx:15`, `bookings.share.$slug.tsx:15`.
 *
 * The API lane behind this page (`/api/native/survey/share/<slug>`) sends
 * `X-Robots-Tag: noindex, nofollow` + `Cache-Control: no-store` on every answer,
 * the same two headers 192b-2 put on the booking lane
 * (src/native/survey/router.ts). Neither half is enough alone: the meta tag
 * governs the rendered page, the header governs the JSON a crawler can fetch
 * directly.
 */
export const Route = createFileRoute("/surveys/share/$slug")({
  component: lazyRouteComponent(() => import("~/lazy/surveys.share.$slug.page")),
  head: () => ({
    meta: [
      { title: "Survey — Simpler Life 100" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
