import type { Lease } from "./types";
const leases = new Map<string, Lease>();
const DEFAULT_TTL = 30_000;
function active(eventId: string): Lease | undefined { const lease = leases.get(eventId); if (!lease) return undefined; if (Date.parse(lease.expiresAt) <= Date.now()) { leases.delete(eventId); return undefined; } return lease; }
export function acquireLease(eventId: string, holderId: string, ttlMs = DEFAULT_TTL): boolean { if (active(eventId)) return false; const now = Date.now(); leases.set(eventId, { eventId, holderId, acquiredAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString() }); return true; }
export function releaseLease(eventId: string, holderId: string): boolean { const lease = active(eventId); if (!lease || lease.holderId !== holderId) return false; leases.delete(eventId); return true; }
export function isLeased(eventId: string): boolean { return active(eventId) !== undefined; }
export function clearLeases(): void { leases.clear(); }
