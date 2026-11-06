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
// SLICE 192b-2 — the client-facing host name, from the ONE resolver the invoice
// page, PDF and delivery email already use. `CALENDAR_SYNC_LABEL` is no longer
// imported here: it promised a Google Calendar sync nothing executes.
import { resolveIssuerDisplayName, NEUTRAL_ISSUER_LABEL } from "../invoice/issuer";
// SLICE 192b-3 — recognise a refusal that came from the approval STORE, so the
// public lane can answer it generically instead of echoing an internal path.
import { isApprovalStoreUnavailable } from "../../lib/approval-queue";
import { createBookingPostLimiter, publicWriteRateKey, BOOKING_POST_WINDOW_MS, type BookingPostLimiter } from "./ratelimit";

export interface NativeBookingsCtx {
  dataDir: string;
  userEmail: string; // tenant id
}
export interface NativeBookingsPublicCtx {
  dataDir: string;
  /** Rate limiter for the public booking POST lane (shared process-wide unless injected for tests). */
  limiter?: BookingPostLimiter;
  /**
   * SLICE 192b-3 (finding #20) — the SOCKET peer address from
   * `peerAddressFrom(server, req)`, passed in by prod-server. The limiter keys
   * on THIS, never on `x-forwarded-for`, which the caller controls. Absent (a
   * direct call, a test, a transport with no peer) → every anonymous caller
   * shares one bucket, which is stricter rather than a bypass.
   */
  peerAddress?: string | null;
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

/**
 * PUBLIC summary — no internal ids (only the slug), no team emails (count only).
 *
 * SLICE 192b-2 — two changes, both truthfulness:
 *   - `calendarSyncLabel` is GONE. It read "Confirmed bookings sync to your
 *     calendar through the connected Google Calendar adapter (verified
 *     integration)". No sync is executed (the confirm path never calls an
 *     adapter), no tenant can connect one, and the only trace is a
 *     `calendarSync: { status: "not-synced" }` intent on the booking record.
 *   - `hostName` is the firm the client is booking with, resolved through the
 *     same customer-safe resolver the invoice page uses. It is `null` — never a
 *     placeholder — when the workspace has set no company name, so the page
 *     cannot attribute a booking to a name nobody chose.
 */
function publicShareView(page: any, hostName: string | null): Record<string, unknown> {
  return {
    name: page.name,
    description: page.description,
    hostName,
    timeZone: page.timeZone,
    slotDurationMinutes: page.slotDurationMinutes,
    bufferMinutes: page.bufferMinutes,
    availability: page.availability.map(describeWindow),
    teamSize: page.team ? page.team.length : 0,
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
/**
 * SLICE 192b-2 — a booking page carries the host's identity and a client's
 * name, email and chosen time. No intermediary may cache it and no crawler may
 * index it: the same two headers the invoice share lane has sent since 191.
 */
const NO_STORE = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } as const;

const sharedBookingPostLimiter = createBookingPostLimiter();

/**
 * SLICE 192b-3 (finding #20) — the public POST used to be keyed on the first
 * hop of `x-forwarded-for`, a header the CALLER writes: one extra value and the
 * budget was fresh again, so the limiter was decorative. It is keyed on the
 * trusted peer address now (`publicWriteRateKey`), which the transport supplies.
 */
function postLimited(ctx: NativeBookingsPublicCtx, slug: string): boolean {
  const limiter = ctx.limiter ?? sharedBookingPostLimiter;
  return !limiter.allow(publicWriteRateKey(slug, ctx.peerAddress));
}

/**
 * SLICE 192b-3 — a refusal from the approval STORE (a corrupt
 * `tenant_approvals.json`, 193's guard) is not the client's mistake: answer 503
 * with a sentence that says nothing was recorded, and never echo the internal
 * path or the parse error an unauthenticated caller must not see.
 */
function approvalStoreUnavailable(): Response {
  return Response.json(
    { error: "The approval queue is unavailable right now, so nothing was recorded. Please try again later." },
    { status: 503 },
  );
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

  if (seg.length === 1 && req.method === "GET") {
    // The host's own name, or nothing — never the tenant id, never a stand-in.
    const resolved = resolveIssuerDisplayName(tenantId, ctx.dataDir);
    const hostName = resolved === NEUTRAL_ISSUER_LABEL ? null : resolved;
    return Response.json({ data: publicShareView(page, hostName) }, { headers: NO_STORE });
  }
  if (seg.length === 2 && seg[1] === "slots" && req.method === "GET") {
    const rawDate = url.searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return json400("date must be YYYY-MM-DD");
    return Response.json(
      { data: { date: rawDate, slots: availableSlotsForDate(page, bookings, rawDate) } },
      { headers: NO_STORE },
    );
  }
  if (seg.length === 1 && req.method === "POST") {
    // Public write lane is rate-limited per slug+TRUSTED PEER (fixed window).
    if (postLimited(ctx, slug)) {
      return Response.json(
        {
          error: `Too many booking requests — please wait ${Math.ceil(BOOKING_POST_WINDOW_MS / 1000)} seconds and try again.`,
          retryAfterSeconds: Math.ceil(BOOKING_POST_WINDOW_MS / 1000),
        },
        { status: 429, headers: { "retry-after": String(Math.ceil(BOOKING_POST_WINDOW_MS / 1000)), ...NO_STORE } },
      );
    }
    const b = parseJsonObject(await req.text());
    const v = validateBookingRequestInput(b);
    if (!v.ok) return json400(v.error);
      if (!v.data) return json400("invalid booking request");
    const res = submitBookingWrite(ctx.dataDir, tenantId, "request", { bookingPageId: page.id, request: v.data, via: "public" }, "client");
    // SLICE 182 — the WRITE outcome ("applied") is not the booking's STATUS.
    // A `request` always creates `status: "requested"` (gate.ts), so the page
    // must be able to print what the record actually says instead of inferring
    // a confirmation from "applied". The record's own status is returned; it is
    // null when the write is only pending (no record exists yet, so no slot is
    // held either).
    if (res.applied) return Response.json({ data: { status: "applied", bookingStatus: res.booking?.status ?? null } }, { headers: NO_STORE }); // autonomy approved instantly
    if (res.pending) return Response.json({ data: { status: "pending", bookingStatus: null } }, { status: 202, headers: NO_STORE }); // tenant-side approval card queued
    // SLICE 192b-3 — a refusal from the store itself (193's guard on a corrupt
    // `tenant_approvals.json`) is a 503 that says nothing was recorded. It must
    // never read as a booking failure (400) or as success.
    if (isApprovalStoreUnavailable((res as { error?: string }).error)) return approvalStoreUnavailable();
    return gateErrorStatus((res as { error?: string }).error ?? "booking write failed");
  }
  if (seg.length === 1 && req.method !== "GET" && req.method !== "POST") return json405();
  if (seg.length === 2 && seg[1] === "slots" && req.method !== "GET") return json405();
  return json404("Unknown booking page link");
}

/**
 * SLICE 192b-2 — every answer from the public booking lane is uncacheable and
 * unindexable, including the ones built by shared helpers that do not know this
 * lane exists. Response headers are mutable for a response this process
 * constructed; the guard keeps that honest if one is ever not.
 */
function withNoStore(res: Response): Response {
  try {
    res.headers.set("cache-control", "no-store");
    res.headers.set("x-robots-tag", "noindex, nofollow");
  } catch {
    // A guarded Response — leave it exactly as the server produced it.
  }
  return res;
}

export function handleNativeBookingShare(req: Request, ctx: NativeBookingsPublicCtx): Promise<Response> {
  return handleShareAsync(req, ctx)
    .catch(() => Response.json({ error: "Internal error" }, { status: 500 }))
    .then(withNoStore);
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