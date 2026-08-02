import type { MonitoredEvent } from "./types";
const seen = new Map<string, number>();
const DEFAULT_TTL = 60 * 60 * 1000;
export function isDuplicate(event: MonitoredEvent): boolean { const expires = seen.get(event.id); if (expires === undefined) return false; if (expires <= Date.now()) { seen.delete(event.id); return false; } return true; }
export function markSeen(event: MonitoredEvent, ttlMs = DEFAULT_TTL): void { seen.set(event.id, Date.now() + ttlMs); }
export function clearSeen(): void { seen.clear(); }
