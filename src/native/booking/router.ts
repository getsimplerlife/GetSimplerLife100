/**
 * native/booking/router.ts — HTTP surface for Phase 3.1 native booking.
 *
 * AUTHED (tenant): /api/native/booking* — list/create/update/publish/archive/
 * delete booking pages, list bookings, confirm/cancel bookings, writes/apply/
 * reject + audit. Reads are tenant-scoped (ctx.userEmail); every mutation is a
 * GATED write (gate.ts). 404 on any foreign/unknown id (fail-closed, no IDOR).
 *
 * PUBLIC (client): /api/native/booking/share/:slug
 *   - GET  → safe page summary (name/description/timezone/slot duration/
 *            availability windows + team SIZE ONLY — never member emails,
 *            never internal ids beyond the slug), and
 *   - GET  /slots?date=YYYY-MM-DD → free slot START instants for that page
 *            calendar date (availability math runs server-side),
 *   - POST → book a slot (requestBooking) — rides the tenant Approval Queue
 *            as a tenant-side pending card; reply is ONLY {status}
 *            ("pending" | "applied") — no tenant internals, no approval ids.
 *   The public POST lane is RATE-LIMITED per slug+client (10/min fixed
 *   window → 429, generic body) — security bar for unauthenticated writes.
 *   The public lane NEVER exposes tenant data: no audit, no pending writes,
 *   no client list, no internal ids.
 *
 * Route parsing uses EXPLICIT SEGMENTS (no two-capture regex) — the Phase 1.4
 * rowMatch/idMatch shadowing bug class is avoided entirely.
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  listBookingPages,
  getBookingPage,
  getBooking,
  lookupBookingShareTenant,
  getBookingPageBySlug,
  listBookings,
  listPendingWrites,
  getPendingWriteById,
  listAudit,
} from "./store";
import {
  submitBookingWrite,
  executePendingBookingWrite,
  noteOwnerDecision,
  createBookingPageMutationFromInput,
} from "./gate";
import { isBookingPageId, isBookingId, validateBookingRequestInput } from "./validate";
import { availableSlotsForDate, describeWindow } from "./availability";
import { CALENDAR_SYNC_LABEL } from "./sync";
import { createBookingPostLimiter, type BookingPostLimiter } from "./ratelimit";

export interface NativeBookingsCtx {
  dataDir: string;
  userEmail: string; // tenant id
}
export interface NativeBookingsPublicCtx {
  dataDir: string;
  /** Rate limiter for the public booking POST lane (shared process-wide unless injected for tests). */
  limiter?: BookingPostLimiter;
}
// ── helpers ─────────────────────────────────────────────────────────────────
function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Body must be a JSON object");
    return v as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON body: ${msg}`);
  }
}
const json400 = (error: string) => Response.json({ error }, { status: 400 });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|available|archived|bookings/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 400 });
}

/** Tenant-facing page summary (no share internals beyond the share path). */
function tenantPageSummary(page: any, origin: string): Record<string, unknown> {
  return {
    id: page.id,
    name: page.name,
    description: page.description,
    slug: page.slug,
    timeZone: page.timeZone,
    slotDurationMinutes: page.slotDurationMinutes,
    bufferMinutes: page.bufferMinutes,
    team: page.team,
    availability: page.availability,
    status: page.status,
    shareUrl: page.slug ? `${origin}/bookings/share/${page.slug}` : null,
    rrIndex: page.rrIndex,
    version: page.version,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    archivedAt: page.archivedAt ?? null,
  };
}
function bookingSummary(b: any): Record<string, unknown> {
  return {
    id: b.id,
    bookingPageId: b.bookingPageId,
    clientName: b.clientName,
    clientEmail: b.clientEmail,
    startAt: b.startAt,
    endAt: b.endAt,
    status: b.status,
    roundRobinAssignee: b.roundRobinAssignee,
    calendarSync: b.calendarSync,
    createdAt: b.createdAt,
    confirmedAt: b.confirmedAt ?? null,
    cancelledAt: b.cancelledAt ?? null,
  };
}

/** PUBLIC summary — no internal ids (only the slug), no team emails (count only). */
function publicShareView(page: any): Record<string, unknown> {
  return {
    name: page.name,
    description: page.description,
    timeZone: page.timeZone,
    slotDurationMinutes: page.slotDurationMinutes,
    bufferMinutes: page.bufferMinutes,
    availability: page.availability.map(describeWindow),
    teamSize: page.team ? page.team.length : 0,
    calendarSyncLabel: CALENDAR_SYNC_LABEL,
  };
}

// ── authed ──────────────────────────────────────────────────────────────────
async function handleAuthedAsync(req: Request, ctx: NativeBookingsCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/booking\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  if (!tenantId) return json401();

  if (seg.length === 0) {
    if (req.method === "GET") {
      const pages = listBookingPages(ctx.dataDir, tenantId);
      return Response.json({ data: { pages: pages.map((p) => tenantPageSummary(p, url.origin)), bookings: listBookings(ctx.dataDir, tenantId).map(bookingSummary) } });
    }
    if (req.method === "POST") {
      // CREATE — raw-body id rejection BEFORE any normalization (server-assigned only).
      const b = parseJsonObject(await req.text());
      if (typeof b.id === "string") {
        return json400("invalid id on create (ids are server-assigned)");
      }
      const mutation = createBookingPageMutationFromInput(b);
      const res = submitBookingWrite(ctx.dataDir, tenantId, "create", { data: mutation, via: "portal" }, tenantId);
      if (res.applied && res.page) return Response.json({ data: { status: "applied", page: tenantPageSummary(res.page, url.origin) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "booking write failed");
    }
    return json405();
  }
  // /writes + /writes/:id/apply|reject + /audit
  if (seg[0] === "writes") {
    if (seg.length === 1 && req.method === "GET") {
      return Response.json({ data: { pendingWrites: listPendingWrites(ctx.dataDir, tenantId) } });
    }
    // Accept BOTH /writes/:id/apply AND /writes/apply/:id (id is the index that
    // matches the pending-write store — portals call /writes/:id/apply).
    const applyIdx = seg.indexOf("apply");
    if (seg.length === 3 && applyIdx !== -1 && req.method === "POST") {
      const wid = applyIdx === 1 ? seg[2] : seg[1];
      const ptw = getPendingWriteById(ctx.dataDir, tenantId, wid);
      if (!ptw || ptw.tenantId !== tenantId) return json404("no pending write for this booking action");
      const res = executePendingBookingWrite(ctx.dataDir, tenantId, ptw.approvalActionId, tenantId);
      if (!res.ok) return gateErrorStatus(res.reason);
      return Response.json({ data: { status: "applied", op: res.op, alreadyApplied: res.alreadyApplied ?? false } });
    }
    const rejectIdx = seg.indexOf("reject");
    if (seg.length === 3 && rejectIdx !== -1 && req.method === "POST") {
      const wid = rejectIdx === 1 ? seg[2] : seg[1];
      const ptw = getPendingWriteById(ctx.dataDir, tenantId, wid);
      if (!ptw || ptw.tenantId !== tenantId) return json404("no pending write for this booking action");
      noteOwnerDecision(ctx.dataDir, tenantId, ptw.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected" } });
    }
    return json404("Unknown native booking endpoint");
  }
  if (seg[0] === "audit") {
    if (req.method !== "GET") return json405();
    return Response.json({ data: { audit: listAudit(ctx.dataDir, tenantId) } });
  }
  // /bookings + /bookings/:id/confirm|cancel
  if (seg[0] === "bookings") {
    if (seg.length === 1 && req.method === "GET") {
      const pageId = url.searchParams.get("pageId");
      const all = listBookings(ctx.dataDir, tenantId);
      const filtered = pageId ? all.filter((b) => b.bookingPageId === pageId) : all;
      return Response.json({ data: { bookings: filtered.map(bookingSummary) } });
    }
    if (seg.length === 3 && req.method === "POST") {
      if (!isBookingId(seg[1])) return json404("Unknown native booking endpoint");
      const booking = getBooking(ctx.dataDir, tenantId, seg[1]);
      if (!booking) return json404("Booking not found"); // foreign/stranger → 404 (no IDOR)
      if (seg[2] === "confirm") {
        const res = submitBookingWrite(ctx.dataDir, tenantId, "confirm", { bookingId: booking.id, via: "portal" }, tenantId);
        if (res.applied) return Response.json({ data: { status: "applied", booking: bookingSummary(res.booking) } });
        if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
        return gateErrorStatus((res as { error?: string }).error ?? "booking write failed");
      }
      if (seg[2] === "cancel") {
        const res = submitBookingWrite(ctx.dataDir, tenantId, "cancel", { bookingId: booking.id, via: "portal" }, tenantId);
        if (res.applied) return Response.json({ data: { status: "applied", booking: bookingSummary(res.booking) } });
        if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
        return gateErrorStatus((res as { error?: string }).error ?? "booking write failed");
      }
    }
    return json404("Unknown native booking endpoint");
  }
  if (!isBookingPageId(seg[0])) return json404("Unknown native booking endpoint");
  const page = getBookingPage(ctx.dataDir, tenantId, seg[0]);
  if (!page) return json404("Booking page not found"); // foreign/stranger → 404 (no IDOR)
  if (seg.length === 1) {
    if (req.method === "GET") return Response.json({ data: tenantPageSummary(page, url.origin) });
    if (req.method === "DELETE") {
      const res = submitBookingWrite(ctx.dataDir, tenantId, "delete", { bookingPageId: page.id, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "deleted" } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "booking write failed");
    }
    if (req.method === "POST") {
      const b = parseJsonObject(await req.text());
      if (b.id !== undefined) return json400("invalid id on update (ids are server-assigned)");
      const mutation = createBookingPageMutationFromInput(b);
      const res = submitBookingWrite(ctx.dataDir, tenantId, "update", { bookingPageId: page.id, data: mutation, via: "portal" }, tenantId);
      if (res.applied && res.page) return Response.json({ data: { status: "applied", page: tenantPageSummary(res.page, url.origin) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "booking write failed");
    }
    return json405();
  }
  if (seg.length === 2 && req.method === "POST") {
    if (seg[1] === "publish") {
      const res = submitBookingWrite(ctx.dataDir, tenantId, "publish", { bookingPageId: page.id, via: "portal" }, tenantId);
      if (res.applied && res.page) return Response.json({ data: { status: "applied", page: tenantPageSummary(res.page, url.origin) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "booking write failed");
    }
    if (seg[1] === "archive") {
      const res = submitBookingWrite(ctx.dataDir, tenantId, "archive", { bookingPageId: page.id, via: "portal" }, tenantId);
      if (res.applied && res.page) return Response.json({ data: { status: "applied", page: tenantPageSummary(res.page, url.origin) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "booking write failed");
    }
  }
  return json404("Unknown native booking endpoint");
}
function json401(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
export function handleNativeBookingsAuthed(req: Request, ctx: NativeBookingsCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Invalid JSON|Body must/.test(msg)) return json400(msg);
    return Response.json({ error: "Internal error" }, { status: 500 });
  });
}

// ── PUBLIC share (client booking page) ──────────────────────────────────────
const sharedBookingPostLimiter = createBookingPostLimiter();

/** Best-effort client identity for rate limiting (slug is the primary key). */
function clientIpOf(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "anon";
}

async function handleShareAsync(req: Request, ctx: NativeBookingsPublicCtx): Promise<Response> {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/native\/booking\/share\/?/, "").split("/").filter(Boolean);
  if (seg.length < 1 || !/^bk_[A-Za-z0-9_-]+$/.test(seg[0])) return json404("Unknown booking page link");
  const slug = seg[0];
  const tenantId = lookupBookingShareTenant(ctx.dataDir, slug);
  if (!tenantId) return json404("Unknown booking page link");
  const page = getBookingPageBySlug(ctx.dataDir, tenantId, slug);
  if (!page) return json404("Unknown booking page link"); // slug stale → fail-closed
  if (page.status !== "published") return json404("Unknown booking page link"); // draft/archived → never public
  const bookings = listBookings(ctx.dataDir, tenantId).filter((b) => b.bookingPageId === page.id);

  if (seg.length === 1 && req.method === "GET") return Response.json({ data: publicShareView(page) });
  if (seg.length === 2 && seg[1] === "slots" && req.method === "GET") {
    const rawDate = url.searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return json400("date must be YYYY-MM-DD");
    return Response.json({ data: { date: rawDate, slots: availableSlotsForDate(page, bookings, rawDate) } });
  }
  if (seg.length === 1 && req.method === "POST") {
    // Public write lane is rate-limited per slug+client (fixed window).
    const limiter = ctx.limiter ?? sharedBookingPostLimiter;
    if (!limiter.allow(`${slug}|${clientIpOf(req)}`)) {
      return Response.json(
        { error: "Too many booking requests — please try again shortly." },
        { status: 429 },
      );
    }
    const b = parseJsonObject(await req.text());
    const v = validateBookingRequestInput(b);
    if (!v.ok) return json400(v.error);
      if (!v.data) return json400("invalid booking request");
    const res = submitBookingWrite(ctx.dataDir, tenantId, "request", { bookingPageId: page.id, request: v.data, via: "public" }, "client");
    if (res.applied) return Response.json({ data: { status: "applied" } }); // autonomy approved instantly
    if (res.pending) return Response.json({ data: { status: "pending" } }); // tenant-side approval card queued
    return gateErrorStatus((res as { error?: string }).error ?? "booking write failed");
  }
  if (seg.length === 1 && req.method !== "GET" && req.method !== "POST") return json405();
  if (seg.length === 2 && seg[1] === "slots" && req.method !== "GET") return json405();
  return json404("Unknown booking page link");
}
export function handleNativeBookingShare(req: Request, ctx: NativeBookingsPublicCtx): Promise<Response> {
  return handleShareAsync(req, ctx).catch(() => Response.json({ error: "Internal error" }, { status: 500 }));
}

// ── Built-in typed events (Phase 1.1 registry pattern, 2.1–2.5) ─────────────
export function registerBuiltinNativeBookingEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.booking.page.created",
    "native.booking.page.updated",
    "native.booking.page.published",
    "native.booking.page.archived",
    "native.booking.page.deleted",
    "native.booking.requested",
    "native.booking.confirmed",
    "native.booking.cancelled",
  ]) {
    registerNativeEventType(t, base);
  }
}