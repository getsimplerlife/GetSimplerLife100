/**
 * native/booking/store.ts — durable, tenant-keyed BOOKING store (Phase 3.1).
 *
 * - Every read/write takes tenantId explicitly and resolves the EXACT tenant
 *   map first — zero cross-tenant paths (a foreign page/booking id resolves to
 *   null → fail-closed 404 upstream).
 * - Mutations are applied ONLY by the gated write path (gate.ts) or the
 *   idempotent pending-apply executor — the store never mutates on its own.
 * - Every mutation appends an IMMUTABLE native.booking.* audit entry.
 * - Share slugs live in a GLOBAL index mapping slug → tenantId ONLY (nothing
 *   else — no tenant data) — same discipline as proposals/deal rooms.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_BOOKINGS_KEY,
  NATIVE_BOOKINGS_AUDIT_KEY,
  NATIVE_BOOKING_SLUGS_KEY,
  MAX_BOOKING_PAGES_PER_TENANT,
  MAX_BOOKING_PAGE_NAME,
  MAX_BOOKING_PAGE_DESC,
  MAX_TIMEZONE,
  MAX_TEAM,
  type BookingPageMutation,
  type BookingPageRecord,
  type BookingPageStatus,
  type BookingRecord,
  type BookingStatus,
  type PendingBookingWrite,
} from "./types";

export interface NativeBookingAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.booking.<...>.*
  bookingPageId?: string;
  bookingId?: string;
  detail: string;
}

interface TenantBookingState {
  pages: BookingPageRecord[];
  bookings: BookingRecord[];
  pendingWrites: PendingBookingWrite[];
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadState(dataDir: string): Record<string, TenantBookingState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_BOOKINGS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantBookingState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantBookingState>): void {
  writeJSON(dataPath(dataDir, NATIVE_BOOKINGS_KEY), state);
}
export function generateBookingEntityId(prefix: "bkg" | "apt" | "bkw"): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
export function generateBookingSlug(): string {
  // Randomized, unguessable public slug (no tenant data in the slug itself).
  return `bk_${Date.now().toString(36)}${randomBytes(9).toString("base64url")}`;
}

// ── Share-slug global index (slug → tenantId ONLY) ─────────────────────────
function loadSlugs(dataDir: string): Record<string, string> {
  const raw = readJSON(dataPath(dataDir, NATIVE_BOOKING_SLUGS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}
function saveSlugs(dataDir: string, slugs: Record<string, string>): void {
  writeJSON(dataPath(dataDir, NATIVE_BOOKING_SLUGS_KEY), slugs);
}
export function lookupBookingShareTenant(dataDir: string, slug: string): string | null {
  const t = loadSlugs(dataDir)[slug];
  return typeof t === "string" && t.length > 0 ? t : null;
}
export function registerBookingSlug(dataDir: string, slug: string, tenantId: string): void {
  const slugs = loadSlugs(dataDir);
  slugs[slug] = tenantId;
  saveSlugs(dataDir, slugs);
}
export function unregisterBookingSlug(dataDir: string, slug: string): void {
  const slugs = loadSlugs(dataDir);
  if (!(slug in slugs)) return;
  delete slugs[slug];
  saveSlugs(dataDir, slugs);
}

// ── Booking pages ───────────────────────────────────────────────────────────
export function listBookingPages(dataDir: string, tenantId: string): BookingPageRecord[] {
  return loadState(dataDir)[tenantId]?.pages ?? [];
}
export function getBookingPage(dataDir: string, tenantId: string, pageId: string): BookingPageRecord | null {
  return listBookingPages(dataDir, tenantId).find((p) => p.id === pageId) ?? null;
}
export function getBookingPageBySlug(dataDir: string, tenantId: string, slug: string): BookingPageRecord | null {
  return listBookingPages(dataDir, tenantId).find((p) => p.slug === slug) ?? null;
}
export function countBookingPages(dataDir: string, tenantId: string): number {
  return listBookingPages(dataDir, tenantId).length;
}
/** Hard-remove an existing booking page (gated delete executor only). */
export function removeBookingPage(dataDir: string, tenantId: string, pageId: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.pages.findIndex((p) => p.id === pageId) ?? -1;
  if (!tenant || idx < 0) return false;
  tenant.pages.splice(idx, 1);
  saveState(dataDir, state);
  return true;
}
/** Insert a NEW booking page (validated upstream; gated executor only). */
export function insertBookingPage(dataDir: string, record: BookingPageRecord): void {
  const state = loadState(dataDir);
  const tenant = state[record.tenantId] ?? { pages: [], bookings: [], pendingWrites: [] };
  if (tenant.pages.length >= MAX_BOOKING_PAGES_PER_TENANT) {
    throw new Error(`Booking page cap reached (${MAX_BOOKING_PAGES_PER_TENANT})`);
  }
  state[record.tenantId] = tenant;
  tenant.pages.push(record);
  saveState(dataDir, state);
}

/**
 * Apply a validated mutation + status transition to an existing booking page.
 * Returns the updated record or null (unknown → 404). Fields are re-bounded
 * here as defense-in-depth (slice + trim) — the gate already validated.
 */
export function applyBookingPageMutation(
  dataDir: string,
  tenantId: string,
  pageId: string,
  mutation: BookingPageMutation,
  nextStatus: BookingPageStatus | null,
  actor: string,
): BookingPageRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.pages.findIndex((p) => p.id === pageId) ?? -1;
  if (!tenant || idx < 0) return null;
  const p = tenant.pages[idx];
  const now = new Date().toISOString();
  const updated: BookingPageRecord = {
    ...p,
    ...(mutation.name !== undefined ? { name: mutation.name.trim().slice(0, MAX_BOOKING_PAGE_NAME) } : {}),
    ...(mutation.description !== undefined ? { description: mutation.description.trim().slice(0, MAX_BOOKING_PAGE_DESC) } : {}),
    ...(mutation.timeZone !== undefined ? { timeZone: mutation.timeZone.trim().slice(0, MAX_TIMEZONE) } : {}),
    ...(mutation.slotDurationMinutes !== undefined ? { slotDurationMinutes: mutation.slotDurationMinutes } : {}),
    ...(mutation.bufferMinutes !== undefined ? { bufferMinutes: mutation.bufferMinutes } : {}),
    ...(mutation.team !== undefined ? { team: mutation.team.map((e) => e.trim()).slice(0, MAX_TEAM) } : {}),
    ...(mutation.availability !== undefined ? { availability: mutation.availability } : {}),
    ...(nextStatus !== null ? { status: nextStatus } : {}),
    ...(nextStatus === "archived" ? { archivedAt: now, archivedBy: actor } : {}),
    version: p.version + 1,
    updatedAt: now,
    updatedBy: actor,
  };
  tenant.pages[idx] = updated;
  saveState(dataDir, state);
  return updated;
}

/**
 * Advance a page's round-robin counter and return the next assignee email
 * (null when the page has no team). Durably persisted with the page record.
 * Used ONLY by the confirm-apply executor.
 */
export function advanceBookingPageRoundRobin(dataDir: string, tenantId: string, pageId: string): string | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.pages.findIndex((p) => p.id === pageId) ?? -1;
  if (!tenant || idx < 0) return null;
  const p = tenant.pages[idx];
  if (!p.team || p.team.length === 0) return null;
  const assignee = p.team[p.rrIndex % p.team.length];
  p.rrIndex = p.rrIndex + 1;
  tenant.pages[idx] = p;
  saveState(dataDir, state);
  return assignee;
}

// ── Bookings ────────────────────────────────────────────────────────────────
export function listBookings(dataDir: string, tenantId: string): BookingRecord[] {
  return loadState(dataDir)[tenantId]?.bookings ?? [];
}
export function getBooking(dataDir: string, tenantId: string, bookingId: string): BookingRecord | null {
  return listBookings(dataDir, tenantId).find((b) => b.id === bookingId) ?? null;
}
export function listBookingsForPage(dataDir: string, tenantId: string, pageId: string): BookingRecord[] {
  return listBookings(dataDir, tenantId).filter((b) => b.bookingPageId === pageId);
}
export function countBookingsForPage(dataDir: string, tenantId: string, pageId: string): number {
  return listBookingsForPage(dataDir, tenantId, pageId).length;
}
export function insertBooking(dataDir: string, record: BookingRecord): void {
  const state = loadState(dataDir);
  const tenant = state[record.tenantId] ?? { pages: [], bookings: [], pendingWrites: [] };
  state[record.tenantId] = tenant;
  tenant.bookings.push(record);
  saveState(dataDir, state);
}
/**
 * Apply a status transition + round-robin assignment to an existing booking.
 * Returns the updated record or null (unknown → 404). Idempotent-safe at the
 * store level: transitions are guarded by the gate; here we just write.
 */
export function applyBookingMutation(
  dataDir: string,
  tenantId: string,
  bookingId: string,
  mutation: { status?: BookingStatus; roundRobinAssignee?: string | null; calendarSync?: BookingRecord["calendarSync"] },
  actor: string,
): BookingRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.bookings.findIndex((b) => b.id === bookingId) ?? -1;
  if (!tenant || idx < 0) return null;
  const b = tenant.bookings[idx];
  const now = new Date().toISOString();
  const updated: BookingRecord = {
    ...b,
    ...(mutation.status === "confirmed" ? { status: "confirmed" as const, roundRobinAssignee: mutation.roundRobinAssignee ?? b.roundRobinAssignee, calendarSync: mutation.calendarSync ?? b.calendarSync, confirmedAt: now, confirmedBy: actor } : {}),
    ...(mutation.status === "cancelled" ? { status: "cancelled" as const, cancelledAt: now, cancelledBy: actor } : {}),
    version: b.version + 1,
    updatedAt: now,
    updatedBy: actor,
  };
  tenant.bookings[idx] = updated;
  saveState(dataDir, state);
  return updated;
}

// ── Pending writes (durable mirror of the approval card) ────────────────────
export function listPendingWrites(dataDir: string, tenantId: string): PendingBookingWrite[] {
  return loadState(dataDir)[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingBookingWrite): void {
  const state = loadState(dataDir);
  const tenant = state[w.tenantId] ?? { pages: [], bookings: [], pendingWrites: [] };
  state[w.tenantId] = tenant;
  tenant.pendingWrites.push(w);
  saveState(dataDir, state);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingBookingWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingBookingWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  actor: string,
  result?: { status?: string; bookingPageId?: string; bookingId?: string; error?: string },
): void {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const w = tenant?.pendingWrites.find((x) => x.id === id);
  if (!tenant || !w || w.status !== "pending") return; // idempotent
  const now = new Date().toISOString();
  if (status === "applied") {
    w.status = "applied";
    w.appliedAt = now;
    w.appliedBy = actor;
    w.appliedResult = { status: result?.status ?? "applied", bookingPageId: result?.bookingPageId, bookingId: result?.bookingId };
  } else {
    w.status = "rejected";
    w.error = result?.error ?? "rejected by owner";
  }
  saveState(dataDir, state);
}

// ── Immutable audit (append-only, keyed by tenant) ──────────────────────────
function loadAudit(dataDir: string): NativeBookingAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_BOOKINGS_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeBookingAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeBookingAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({
    id: generateBookingEntityId("bkw"),
    ts: new Date().toISOString(),
    ...entry,
  });
  writeJSON(dataPath(dataDir, NATIVE_BOOKINGS_AUDIT_KEY), audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeBookingAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}