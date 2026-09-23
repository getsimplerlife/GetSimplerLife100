/**
 * native/booking/types.ts — Phase 3.1 native BOOKING/SCHEDULING
 * (self-serve booking pages, availability, round-robin rules, confirm;
 * calendar sync to Google Calendar stays the verified B adapter, labeled).
 *
 * Discipline (mirrors P2.1–P2.5 exactly):
 *   - tenant-keyed store + durable pending-write mirror + immutable
 *     native.booking.* audit on every mutation,
 *   - server-assigned ids (bkg_/apt_/bkw_…) — forged id on create → 400
 *     BEFORE any normalization (raw-body reject in the router); unknown id
 *     on ops → 400/404 fail-closed,
 *   - validation happens BEFORE the gate (a never-valid write never queues),
 *   - every write rides the Approval Queue with VERB-FIRST action names
 *     (createBookingPage/publishBookingPage/requestBooking/confirmBooking/…)
 *     so isWriteAction classifies them as writes (P2.5 generate lesson),
 *   - a randomized unguessable share slug (global index → tenant only) gives
 *     the CLIENT a public booking page: GET summary + available slots (no
 *     tenant internals), POST a booking request that creates a TENANT-side
 *     approval card; the OWNER confirms (gated) — approval-gated confirmations,
 *   - availability math is pure + deterministic (availability.ts) — rechecked
 *     at request AND again at apply (a taken slot never double-books),
 *   - round-robin: booking pages carry an optional team list; each confirm
 *     advances a per-page rotation counter and assigns the next member,
 *   - calendarSync is a durable intent on the confirmed booking: the payload is
 *     carried on the typed native.booking.confirmed event; the actual Google
 *     Calendar write runs through the EXISTING verified google-calendar adapter
 *     (createGoogleCalendarEvent, gated) — always labeled as adapter-lane,
 *     never claimed as native (P2.5 invoice precedent, owner 09-20).
 */
export type BookingPageStatus = "draft" | "published" | "archived";
export type BookingStatus = "requested" | "confirmed" | "cancelled";

/** One weekly availability window (dayOfWeek 0=Sunday…6=Saturday). */
export interface AvailabilityWindow {
  dayOfWeek: number; // 0..6
  startMinutes: number; // 0..1439
  endMinutes: number; // startMinutes < endMinutes ≤ 1440
}

/** A self-serve booking page (the "service" the client books into). */
export interface BookingPageRecord {
  id: string; // bkg_<random> — server-assigned
  tenantId: string;
  name: string; // 1..MAX_BOOKING_PAGE_NAME
  description: string; // ≤ MAX_BOOKING_PAGE_DESC ("")
  /** Randomized public booking slug (global index, slug→tenant only). */
  slug: string | null;
  timeZone: string; // IANA name (≤ MAX_TIMEZONE); used for slot math + display
  slotDurationMinutes: number; // 15 | 30 | 60
  bufferMinutes: number; // 0..240 (gap after each booking)
  /** Optional round-robin team (emails, ≤ MAX_TEAM). */ 
  team: string[];
  availability: AvailabilityWindow[]; // ≤ MAX_AVAILABILITY_WINDOWS
  /** Round-robin rotation counter (advanced per confirmation). */
  rrIndex: number;
  status: BookingPageStatus;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt?: string;
  archivedBy?: string;
}

/** One client booking request on a booking page. */
export interface BookingRecord {
  id: string; // apt_<random> — server-assigned
  tenantId: string;
  bookingPageId: string; // bkg_ — must exist in-tenant
  clientName: string; // 1..MAX_CLIENT_NAME
  clientEmail: string; // validated email ≤ MAX_CLIENT_EMAIL
  startAt: string; // ISO 8601 (UTC instant)
  endAt: string; // startAt + slotDurationMinutes
  status: BookingStatus;
  /** Round-robin assignee chosen at confirm — null until then. */
  roundRobinAssignee: string | null;
  /** Durable calendar-sync intent — the adapter lane (B), not native. */
  calendarSync: { provider: "google-calendar"; status: "not-synced" | "pending"; note?: string };
  version: number;
  createdAt: string;
  createdBy: string; // tenant email on owner-side creates, "public" for client requests
  updatedAt: string;
  updatedBy: string;
  confirmedAt?: string;
  confirmedBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
}

/** Booking-page mutation (create/update). */
export interface BookingPageMutation {
  name?: string;
  description?: string;
  timeZone?: string;
  slotDurationMinutes?: number;
  bufferMinutes?: number;
  team?: string[];
  availability?: AvailabilityWindow[];
}

/** Client booking request payload (public share). */
export interface BookingRequestInput {
  clientName: string;
  clientEmail: string;
  startAt: string;
}

/**
 * Gated-write ops. ACTION NAMES are verb-first and each verb used here MUST
 * be classified as a WRITE by approval-queue.isWriteAction (WRITE_VERB).
 * P2.5 lesson: publish/confirm/request were NOT in WRITE_VERB — without the
 * core fix they would have BYPASSED the Approval Queue (fail-open).
 */
export type BookingOp =
  | "create" // createBookingPage (page create)
  | "update" // updateBookingPage
  | "publish" // publishBookingPage
  | "archive" // archiveBookingPage (terminal)
  | "delete" // deleteBookingPage (draft only)
  | "request" // requestBooking (client, public share lane)
  | "confirm" // confirmBooking (owner, approval-gated)
  | "cancel"; // cancelBooking

export interface PendingBookingWrite {
  id: string; // bkw_<random>
  tenantId: string;
  bookingPageId: string | null; // null for create
  bookingId: string | null; // null for create/request
  op: BookingOp;
  payload: {
    data?: BookingPageMutation;
    request?: BookingRequestInput;
    via?: string; // "portal" | "public"
  };
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { status: string; bookingPageId?: string; bookingId?: string };
  appliedAt?: string;
  appliedBy?: string;
  error?: string;
}

// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_BOOKING_PAGES_PER_TENANT = 50;
export const MAX_PENDING_BOOKING_WRITES = 50;
export const MAX_BOOKING_PAGE_NAME = 200;
export const MAX_BOOKING_PAGE_DESC = 2000;
export const MAX_TIMEZONE = 64;
export const MAX_TEAM = 10;
export const MAX_AVAILABILITY_WINDOWS = 7;
export const MAX_CLIENT_NAME = 200;
export const MAX_CLIENT_EMAIL = 200;
export const MAX_BOOKINGS_PER_PAGE = 200;
export const VALID_SLOT_DURATIONS = [15, 30, 60] as const;
export const MAX_BUFFER_MINUTES = 240;
export const MINUTES_PER_DAY = 24 * 60;

// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_BOOKINGS_KEY = "native_bookings.json";
export const NATIVE_BOOKINGS_AUDIT_KEY = "native_bookings_audit.json";
export const NATIVE_BOOKING_SLUGS_KEY = "native_booking_slugs.json";