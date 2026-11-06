/**
 * share-links.ts — the public URLs a customer opens without an account.
 *
 * WHY THIS MODULE EXISTS (slice 181). `/portal/surveys` built the link it tells
 * a tenant to send to their client as
 *
 *     `${window.location.origin}/api/native/survey/share/${slug}`
 *
 * (portal.surveys.index.page.tsx:137 before this slice). That is the JSON
 * endpoint, not a page: the client opened it and got `{"data":{...}}` — no form,
 * no way to answer. Every other share lane in the portal points at a real route
 * (`/invoices/share/<slug>`, `/proposals/share/<slug>`, `/deal-rooms/share/<slug>`).
 *
 * The page route and the API route differ by one segment, so the value is
 * written ONCE here and both the portal page and the respondent page import it.
 * `src/test/survey-respondent-181.test.tsx` checks the page path against the
 * router's own `FileRoutesByFullPath` and checks that the link the surveys page
 * renders resolves to that route — so the two cannot drift apart again.
 *
 * The server contract these mirror is `src/native/survey/router.ts`:
 *   GET  /api/native/survey/share/<slug>          → 200 { data: publicProjection }
 *   POST /api/native/survey/share/<slug>/submit   → 200 recorded / 202 pending / 400 / 429
 * The slug regex on the server is /^[A-Za-z0-9_-]{4,64}$/, so encoding is a
 * no-op for any slug the server would accept; it is here so a slug can never
 * break out of its path segment.
 */

/** The PAGE a respondent opens — served by src/routes/surveys.share.$slug.tsx. */
export function surveySharePath(slug: string): string {
  return `/surveys/share/${encodeURIComponent(slug)}`;
}

/** The public JSON projection the respondent page reads (GET). */
export function surveyPublicApiPath(slug: string): string {
  return `/api/native/survey/share/${encodeURIComponent(slug)}`;
}

/** The public submit endpoint (POST) — the API path plus the `submit` segment. */
export function surveyPublicSubmitPath(slug: string): string {
  return `${surveyPublicApiPath(slug)}/submit`;
}

// ── SLICE 192b-2 — proposals and bookings, the same one-definition rule ──────
//
// Both share pages used to build these URLs as inline template literals, so a
// change to the lane (or a typo) had nowhere to fail except in a client's
// browser. The pages and their tests now read the path from here.
//
// Server contracts they mirror:
//   GET  /api/native/proposals/share/<slug>        → 200 view / 404 / 410 / 5xx
//   POST /api/native/proposals/share/<slug>        → 200 applied / 202 queued / 409 / 4xx
//   GET  /api/native/booking/share/<slug>          → 200 view / 404 / 5xx
//   GET  /api/native/booking/share/<slug>/slots?date=YYYY-MM-DD → 200 { slots }
//   POST /api/native/booking/share/<slug>          → 200 / 202 / 429 / 4xx
// The server slug patterns are /^sp_[A-Za-z0-9_-]+$/ and /^bk_[A-Za-z0-9_-]+$/
// (src/native/proposals/router.ts, src/native/booking/router.ts), so encoding is
// a no-op for any slug the server would accept; it is here so a slug can never
// break out of its path segment.

/** The public JSON view a proposal client reads (GET) and decides through (POST). */
export function proposalPublicApiPath(slug: string): string {
  return `/api/native/proposals/share/${encodeURIComponent(slug)}`;
}

/** The public JSON view a booking client reads (GET) and requests through (POST). */
export function bookingPublicApiPath(slug: string): string {
  return `/api/native/booking/share/${encodeURIComponent(slug)}`;
}

/** The free-slot list for one calendar date on a booking page. */
export function bookingSlotsApiPath(slug: string, date: string): string {
  return `${bookingPublicApiPath(slug)}/slots?date=${encodeURIComponent(date)}`;
}
