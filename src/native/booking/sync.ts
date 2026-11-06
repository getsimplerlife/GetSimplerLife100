/**
 * native/booking/sync.ts — booking → calendar sync intent (Phase 3.1).
 *
 * The native slice stores a DURABLE sync intent on every confirmed booking and
 * carries the ready-to-send payload on the typed native.booking.confirmed
 * event. The actual calendar write runs through the EXISTING verified
 * google-calendar adapter (createGoogleCalendarEvent, a gated WRITE action) —
 * the adapter lane (B), never claimed as native (P2.5 invoice precedent:
 * "posting to your accounting books is handled by the connected accounting
 * adapter" — here: "sync to your calendar is handled by the connected Google
 * Calendar adapter"). No new provider connection code in this slice.
 */
import type { BookingPageRecord, BookingRecord } from "./types";

export interface CalendarEventPayload {
  summary: string;
  start: string; // ISO 8601 (real UTC instant)
  end: string; // ISO 8601
  description: string;
}

/** Build the event payload a consumer (the adapter lane) would send to Google Calendar. */
export function bookingCalendarEventPayload(page: BookingPageRecord, booking: BookingRecord): CalendarEventPayload {
  return {
    summary: `Booking: ${page.name}`,
    start: booking.startAt,
    end: booking.endAt,
    description: `Client: ${booking.clientName} <${booking.clientEmail}>${booking.roundRobinAssignee ? ` · Host: ${booking.roundRobinAssignee}` : ""} · Booking ${booking.id} · ${page.timeZone}`,
  };
}

/**
 * SLICE 192b-2 — `CALENDAR_SYNC_LABEL` lived here and was rendered on every
 * published booking page: "Confirmed bookings sync to your calendar through the
 * connected Google Calendar adapter (verified integration)". It was not true.
 * Nothing in the confirm path calls an adapter, the booking record only ever
 * holds `calendarSync: { status: "not-synced" }`, and no tenant can connect a
 * calendar — so the label is DELETED rather than softened. It comes back only
 * when a real connection exists AND the confirm path executes it, and then it
 * is built from the connection's own state.
 */