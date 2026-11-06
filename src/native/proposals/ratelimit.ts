/**
 * Rate limit for the PUBLIC proposals decision POST (finding #9, slice 192b-3).
 *
 * The booking lane already shipped the product's only public-write limiter
 * (`native/booking/ratelimit.ts`): an in-memory fixed window in the single Bun
 * process, bounded map, fails closed. This module REUSES that implementation —
 * there is no second algorithm and no new dependency — and only declares the
 * proposals lane's own budget, so the two lanes can be tuned separately.
 *
 * MEASURABLE AND HONEST:
 *   - cap: PROPOSAL_POST_LIMIT requests per PROPOSAL_POST_WINDOW_MS (default
 *     10 per 60 s) per (share slug, trusted peer address);
 *   - enforced in `handleShareAsync` (native/proposals/router.ts) BEFORE the
 *     body is parsed and before anything is enqueued;
 *   - the key uses the SOCKET peer address (`peerAddressFrom` in
 *     `lib/rate-limit.ts`, plumbed through the handler ctx by prod-server), never
 *     the caller-controlled `x-forwarded-for` header. When no peer address is
 *     available every anonymous caller shares ONE bucket — stricter, never a
 *     bypass;
 *   - the 429 names the window, so the client is told what to do rather than
 *     being handed a mystery status.
 */
export { createBookingPostLimiter as createProposalPostLimiter } from "../booking/ratelimit";
export type { BookingPostLimiter as ProposalPostLimiter } from "../booking/ratelimit";

/** Requests allowed per window, per (slug, peer). */
export const PROPOSAL_POST_LIMIT = 10;
/** Fixed window length in ms — the same minute the 429 tells the client to wait. */
export const PROPOSAL_POST_WINDOW_MS = 60_000;
