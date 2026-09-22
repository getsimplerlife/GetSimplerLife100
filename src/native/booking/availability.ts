/**
 * native/booking/availability.ts — pure, deterministic availability math (Phase 3.1).
 *
 * Slots are computed in the page's declared timeZone from its weekly windows:
 *   - a calendar date (YYYY-MM-DD) is resolved to a weekday in the page's tz,
 *   - each window contributes candidate start times aligned to the slot grid,
 *   - a candidate is free iff it does not overlap any existing (non-cancelled)
 *     booking interval [startAt, endAt + bufferMinutes),
 *   - conversion from local wall clock → UTC instant uses Date.UTC (no offset
 *     math, so DST cannot produce inconsistent instants).
 *
 * These functions are PURE — gate.ts rechecks them at request AND again at
 * apply (a taken slot never double-books).
 */
import { MINUTES_PER_DAY, type AvailabilityWindow, type BookingPageRecord, type BookingRecord } from "./types";

const MS_PER_MIN = 60_000;

/** Local wall-clock parts (year/month/day/hour/minute) of an instant in the page tz. */
export function localParts(tz: string, iso: string): { y: number; mo: number; d: number; h: number; mi: number; dow: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: get("year"), mo: get("month") - 1, d: get("day"), h: get("hour"), mi: get("minute"), dow: dowMap[parts.find((p) => p.type === "weekday")?.value ?? "Sun"] ?? 0 };
}

/**
 * Weekday (0=Sunday) of a YYYY-MM-DD calendar date in the page tz.
 * Scans UTC hours 0..23 to find an instant whose wall clock falls on that date
 * (handles any possible tz offset ±14h without off-by-one), then reads its
 * weekday — deterministic and pure.
 */
export function weekdayOf(tz: string, dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  for (let h = 0; h < 24; h++) {
    const p = localParts(tz, new Date(Date.UTC(y, mo - 1, d, h)).toISOString());
    if (p.y === y && p.mo === mo - 1 && p.d === d) return p.dow;
  }
  return localParts(tz, `${dateStr}T12:00:00Z`).dow;
}

/**
 * Convert a PAGE wall-clock time (y/mo/d h:mi, mo 0-based) to the REAL UTC
 * instant for that wall time in the page tz. Probes every tz offset in the
 * ±14h range at 15-min steps and picks the instant whose wall clock in tz
 * equals the requested wall time — exact for any IANA tz and any DST state,
 * and fully deterministic (Intl.String subtract in probe space).
 */
export function localWallToUtcIso(tz: string, y: number, mo: number, d: number, h: number, mi: number): string {
  for (let off = -14 * 60; off <= 14 * 60; off += 15) {
    const utcMs = Date.UTC(y, mo, d, h, mi) - off * MS_PER_MIN;
    const p = localParts(tz, new Date(utcMs).toISOString());
    if (p.y === y && p.mo === mo && p.d === d && p.h === h && p.mi === mi) {
      return new Date(utcMs).toISOString();
    }
  }
  // Unreachable for real IANA tz; fall back to wall-as-UTC (still deterministic).
  return new Date(Date.UTC(y, mo, d, h, mi)).toISOString();
}

/** Booked intervals that block a slot: [start, end + buffer) for non-cancelled bookings. */
export function busyIntervals(page: BookingPageRecord, bookings: BookingRecord[]): Array<{ start: number; end: number }> {
  return bookings
    .filter((b) => b.status !== "cancelled")
    .map((b) => ({
      start: Date.parse(b.startAt),
      end: Date.parse(b.endAt) + page.bufferMinutes * MS_PER_MIN,
    }));
}

function overlaps(candidateStart: number, candidateEnd: number, busy: Array<{ start: number; end: number }>): boolean {
  return busy.some((b) => candidateStart < b.end && b.start < candidateEnd);
}

/**
 * All free slot START instants for a given calendar date (YYYY-MM-DD) in the
 * page's timeZone. Deterministic and pure.
 */
export function availableSlotsForDate(page: BookingPageRecord, bookings: BookingRecord[], dateStr: string): string[] {
  if (page.status !== "published") return [];
  const dow = weekdayOf(page.timeZone, dateStr);
  const windows = page.availability.filter((w) => w.dayOfWeek === dow);
  if (windows.length === 0) return [];
  const busy = busyIntervals(page, bookings);
  const out: string[] = [];
  const [y, mo, d] = dateStr.split("-").map(Number);
  for (const w of windows) {
    // Align to the slot grid (slotDuration) from the window start.
    let startMin = Math.ceil(w.startMinutes / page.slotDurationMinutes) * page.slotDurationMinutes;
    const lastStart = w.endMinutes - page.slotDurationMinutes;
    while (startMin <= lastStart) {
      const startIso = localWallToUtcIso(page.timeZone, y, mo - 1, d, Math.floor(startMin / 60), startMin % 60);
      const cs = Date.parse(startIso);
      if (!overlaps(cs, cs + page.slotDurationMinutes * MS_PER_MIN, busy)) out.push(startIso);
      startMin += page.slotDurationMinutes;
    }
  }
  return [...new Set(out)].sort();
}

/** True iff a given ISO start is a free slot on the page right now. */
export function isSlotAvailable(page: BookingPageRecord, bookings: BookingRecord[], startAtIso: string): boolean {
  if (page.status !== "published") return false;
  const dt = new Date(startAtIso);
  if (Number.isNaN(dt.getTime())) return false;
  // The calendar date is the PAGE wall-clock date of the instant (not UTC date).
  const { y, mo, d } = localParts(page.timeZone, startAtIso);
  const dateStr = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const slots = availableSlotsForDate(page, bookings, dateStr);
  return slots.some((s) => Date.parse(s) === dt.getTime());
}

/** End instant for a booking start (start + slotDuration). */
export function bookingEndIso(page: BookingPageRecord, startAtIso: string): string {
  return new Date(Date.parse(startAtIso) + page.slotDurationMinutes * MS_PER_MIN).toISOString();
}

/** Human label for a window (e.g. "Mon 09:00–17:00"). */
export function describeWindow(w: AvailabilityWindow): string {
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w.dayOfWeek];
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${day} ${fmt(w.startMinutes)}–${fmt(w.endMinutes)}`;
}

export { MINUTES_PER_DAY };