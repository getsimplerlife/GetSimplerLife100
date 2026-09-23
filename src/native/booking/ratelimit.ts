/**
 * In-memory fixed-window rate limiter for the PUBLIC booking POST lane.
 *
 * The server is a single Bun process, so a process-local limiter is honest
 * and effective: it throttles abusive repeated booking submissions per
 * slug+client without needing durable state. The limiter FAILS CLOSED — if a
 * window record is absent or stale the request is still counted from now, and
 * the router only ever checks `allow()` for the one public write action.
 *
 * Memory is bounded: stale windows are pruned on access and the map is capped
 * (oldest window evicted at the cap).
 */
export interface BookingPostLimiter {
  /** Returns true if `key` may proceed (within its window budget). */
  allow(key: string, now?: number): boolean;
}

export const BOOKING_POST_LIMIT = 10; // requests
export const BOOKING_POST_WINDOW_MS = 60_000; // rolling fixed window

export function createBookingPostLimiter(
  limit = BOOKING_POST_LIMIT,
  windowMs = BOOKING_POST_WINDOW_MS,
  maxKeys = 10_000,
): BookingPostLimiter {
  const hits = new Map<string, { count: number; windowStart: number }>();
  return {
    allow(key: string, now: number = Date.now()): boolean {
      const e = hits.get(key);
      if (!e || now - e.windowStart >= windowMs) {
        if (hits.size >= maxKeys) {
          // evict the oldest window entry to keep memory bounded
          let oldestKey: string | null = null;
          let oldestStart = Infinity;
          for (const [k, v] of hits) {
            if (v.windowStart < oldestStart) {
              oldestStart = v.windowStart;
              oldestKey = k;
            }
          }
          if (oldestKey) hits.delete(oldestKey);
        }
        hits.set(key, { count: 1, windowStart: now });
        return true;
      }
      e.count += 1;
      return e.count <= limit;
    },
  };
}