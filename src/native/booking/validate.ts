/**
 * native/booking/validate.ts — Phase 3.1 native BOOKING validation.
 *
 * Shape/syntax only. Existence checks (bookingPageId in-tenant, availability
 * vs. taken slots) happen in the gate/store where the data lives. Fail-closed:
 * unknown keys are dropped, ids are pattern-checked, and nothing here ever
 * trusts a client-supplied record id.
 */
import {
  MAX_AVAILABILITY_WINDOWS,
  MAX_BOOKING_PAGE_DESC,
  MAX_BOOKING_PAGE_NAME,
  MAX_BUFFER_MINUTES,
  MAX_CLIENT_EMAIL,
  MAX_CLIENT_NAME,
  MAX_TEAM,
  MAX_TIMEZONE,
  MINUTES_PER_DAY,
  VALID_SLOT_DURATIONS,
  type AvailabilityWindow,
  type BookingPageMutation,
  type BookingRequestInput,
} from "./types";

export type ValidateResult = { ok: true } | { ok: false; error: string };

export function isBookingPageId(v: unknown): v is string {
  return typeof v === "string" && /^bkg_[A-Za-z0-9_-]+$/.test(v);
}
export function isBookingId(v: unknown): v is string {
  return typeof v === "string" && /^apt_[A-Za-z0-9_-]+$/.test(v);
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isValidEmail(v: string): boolean {
  return v.trim().length <= MAX_CLIENT_EMAIL && EMAIL_RE.test(v.trim());
}
export function isIsoDatetime(v: string): boolean {
  return ISO_RE.test(v) && !Number.isNaN(Date.parse(v));
}

/** Validate one availability window. */
export function validateAvailabilityWindow(w: unknown): AvailabilityWindow | null {
  if (!w || typeof w !== "object" || Array.isArray(w)) return null;
  const o = w as Record<string, unknown>;
  if (!Number.isInteger(o.dayOfWeek) || (o.dayOfWeek as number) < 0 || (o.dayOfWeek as number) > 6) return null;
  if (!Number.isInteger(o.startMinutes) || (o.startMinutes as number) < 0 || (o.startMinutes as number) >= MINUTES_PER_DAY) return null;
  if (!Number.isInteger(o.endMinutes) || (o.endMinutes as number) <= (o.startMinutes as number) || (o.endMinutes as number) > MINUTES_PER_DAY) return null;
  void MAX_AVAILABILITY_WINDOWS;
  return { dayOfWeek: o.dayOfWeek as number, startMinutes: o.startMinutes as number, endMinutes: o.endMinutes as number };
}

/**
 * Validate + normalize a booking-page mutation. Returns the sanitized mutation
 * (never trusts raw input). Availability/team arrays are bounded + element-validated.
 */
export function validateBookingPageMutation(m: BookingPageMutation): ValidateResult & { data?: BookingPageMutation } {
  const out: BookingPageMutation = {};
  if (m.name !== undefined) {
    const n = typeof m.name === "string" ? m.name.trim() : "";
    if (n.length < 1 || n.length > MAX_BOOKING_PAGE_NAME) return { ok: false, error: `name must be a 1..${MAX_BOOKING_PAGE_NAME}-char string` };
    out.name = n;
  }
  if (m.description !== undefined) {
    const d = typeof m.description === "string" ? m.description : "";
    if (d.length > MAX_BOOKING_PAGE_DESC) return { ok: false, error: `description must be ≤ ${MAX_BOOKING_PAGE_DESC} chars` };
    out.description = d;
  }
  if (m.timeZone !== undefined) {
    const tz = typeof m.timeZone === "string" ? m.timeZone.trim() : "";
    if (tz.length < 1 || tz.length > MAX_TIMEZONE) return { ok: false, error: `timeZone must be a 1..${MAX_TIMEZONE}-char IANA name` };
    out.timeZone = tz;
  }
  if (m.slotDurationMinutes !== undefined) {
    if (!(VALID_SLOT_DURATIONS as readonly number[]).includes(m.slotDurationMinutes)) return { ok: false, error: `slotDurationMinutes must be one of ${VALID_SLOT_DURATIONS.join("/")}` };
    out.slotDurationMinutes = m.slotDurationMinutes;
  }
  if (m.bufferMinutes !== undefined) {
    if (!Number.isInteger(m.bufferMinutes) || m.bufferMinutes < 0 || m.bufferMinutes > MAX_BUFFER_MINUTES) {
      return { ok: false, error: `bufferMinutes must be an integer 0..${MAX_BUFFER_MINUTES}` };
    }
    out.bufferMinutes = m.bufferMinutes;
  }
  if (m.team !== undefined) {
    if (!Array.isArray(m.team) || m.team.length > MAX_TEAM || !m.team.every((e) => typeof e === "string" && isValidEmail(e))) {
      return { ok: false, error: `team must be an array of ≤ ${MAX_TEAM} valid emails` };
    }
    out.team = m.team.map((e) => e.trim());
  }
  if (m.availability !== undefined) {
    if (!Array.isArray(m.availability) || m.availability.length > MAX_AVAILABILITY_WINDOWS) {
      return { ok: false, error: `availability must be an array of ≤ ${MAX_AVAILABILITY_WINDOWS} windows` };
    }
    const windows: AvailabilityWindow[] = [];
    for (const w of m.availability) {
      const v = validateAvailabilityWindow(w);
      if (!v) return { ok: false, error: "availability window must have dayOfWeek 0..6 and startMinutes < endMinutes ≤ 1440" };
      windows.push(v);
    }
    out.availability = windows;
  }
  return { ok: true, data: out };
}

/** Build a BookingPageMutation from a create/update request body (raw keys dropped). */
export function createBookingPageMutationFromInput(body: Record<string, unknown>): BookingPageMutation {
  const m: BookingPageMutation = {};
  if (typeof body.name === "string") m.name = body.name;
  if (typeof body.description === "string") m.description = body.description;
  if (typeof body.timeZone === "string") m.timeZone = body.timeZone;
  if (typeof body.slotDurationMinutes === "number") m.slotDurationMinutes = body.slotDurationMinutes;
  if (typeof body.bufferMinutes === "number") m.bufferMinutes = body.bufferMinutes;
  if (Array.isArray(body.team)) m.team = body.team as string[];
  if (Array.isArray(body.availability)) m.availability = body.availability as AvailabilityWindow[];
  return m;
}

/**
 * Validate the CLIENT booking request (public share lane). Fail-closed bounds
 * on name/email, plus a strict ISO datetime shape (timezone allowed). Slot
 * availability is NOT decided here — the gate rechecks it against live data.
 */
export function validateBookingRequestInput(raw: unknown): ValidateResult & { data?: BookingRequestInput } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "booking request must be an object" };
  const o = raw as Record<string, unknown>;
  const clientName = typeof o.clientName === "string" ? o.clientName.trim() : "";
  if (clientName.length < 1 || clientName.length > MAX_CLIENT_NAME) return { ok: false, error: `clientName must be a 1..${MAX_CLIENT_NAME}-char string` };
  const clientEmail = typeof o.clientEmail === "string" ? o.clientEmail.trim() : "";
  if (!isValidEmail(clientEmail)) return { ok: false, error: "clientEmail must be a valid email" };
  const startAt = typeof o.startAt === "string" ? o.startAt : "";
  if (!isIsoDatetime(startAt)) return { ok: false, error: "startAt must be an ISO 8601 datetime (e.g. 2026-09-30T14:00:00Z)" };
  return { ok: true, data: { clientName, clientEmail, startAt } };
}