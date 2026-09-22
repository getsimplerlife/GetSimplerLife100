/**
 * native/booking/gate.ts — GATED WRITE PATH for native booking (Phase 3.1).
 *
 * Mirrors the Phase 2.1–2.5 gates exactly:
 *   - validation happens BEFORE the gate (a never-valid write never queues),
 *   - every write action rides the Approval Queue by default via
 *     approvalGate(tenantId, actionName, "native-bookings", params, …),
 *   - autonomy (#236): allow-listed entries auto-apply; globs can NEVER
 *     auto-delete/cancel (destructive ops need exact ids),
 *   - a durable pending-write mirror lands with each approval card (tenant
 *     record untouched until apply) and the approve-path executor applies
 *     idempotently (replay → alreadyApplied),
 *   - every apply appends an immutable native.booking.* audit entry,
 *   - ACTION NAMES ARE VERB-FIRST AND EVERY VERB IS IN WRITE_VERB
 *     (create/update/publish/archive/delete/request/confirm/cancel) — the
 *     P2.5 `generate` lesson: publish/confirm/request were NOT in WRITE_VERB
 *     and would have BYPASSED the gate as reads (fail-open); approval-queue.ts
 *     was extended and locked by tests in this slice,
 *   - the PUBLIC request lane (client books on a published page via the share
 *     slug) validates the slot and CREATES the booking only on apply — the
 *     owner then CONFIRMS (approval-gated) which assigns the round-robin host
 *     and sets the durable calendar-sync intent; sync itself stays the
 *     verified Google Calendar adapter lane (labeled, out of scope),
 *   - slot availability is rechecked at REQUEST time AND AGAIN AT APPLY (a
 *     slot taken meanwhile fails the apply — never double-booked),
 *   - lifecycle: page draft → published → archived (terminal); booking
 *     requested → confirmed → cancelled (terminal).
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  MAX_BOOKINGS_PER_PAGE,
  MAX_PENDING_BOOKING_WRITES,
  type BookingOp,
  type BookingPageMutation,
  type BookingPageRecord,
  type BookingRecord,
  type BookingRequestInput,
  type PendingBookingWrite,
} from "./types";
import {
  appendAudit,
  advanceBookingPageRoundRobin,
  applyBookingMutation,
  applyBookingPageMutation,
  countBookingsForPage,
  generateBookingEntityId,
  generateBookingSlug,
  getBooking,
  getBookingPage,
  insertBooking,
  insertBookingPage,
  listBookingPages,
  listBookings,
  listBookingsForPage,
  listPendingWrites,
  markPendingWrite,
  registerBookingSlug,
  removeBookingPage,
  savePendingWrite,
  unregisterBookingSlug,
} from "./store";
import {
  createBookingPageMutationFromInput,
  isBookingId,
  isBookingPageId,
  validateBookingPageMutation,
  validateBookingRequestInput,
} from "./validate";
import { bookingEndIso, isSlotAvailable } from "./availability";
import { bookingCalendarEventPayload } from "./sync";

export type BookingWriteRequest = {
  bookingPageId?: string; // null for create
  bookingId?: string;
  data?: BookingPageMutation;
  request?: BookingRequestInput;
  via?: string; // "portal" | "public"
};

export type BookingWriteResult =
  | { applied: true; pending: false; page?: BookingPageRecord; booking?: BookingRecord; op: BookingOp; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: BookingOp }
  | { applied: false; pending: false; error: string };

/** ACTION NAMES are verb-first AND each verb is in WRITE_VERB (fail-open guard). */
const ACTION_NAME: Record<BookingOp, string> = {
  create: "createBookingPage",
  update: "updateBookingPage",
  publish: "publishBookingPage",
  archive: "archiveBookingPage",
  delete: "deleteBookingPage",
  request: "requestBooking",
  confirm: "confirmBooking",
  cancel: "cancelBooking",
};

/** Statuses that are TERMINAL for each record kind. */
function isPageTerminal(status: BookingPageRecord["status"]): boolean {
  return status === "archived";
}
function isBookingTerminal(status: BookingRecord["status"]): boolean {
  return status === "cancelled";
}

export interface ValidatedWrite {
  mutation: BookingPageMutation;
  validationOk: boolean;
}

/**
 * Validate the write BEFORE it reaches the queue. Throws on failure (the
 * caller turns it into a 400). Reflects P2.x discipline: linked bookingPageId
 * must EXIST IN THE TENANT and be non-terminal; the slot must be free when the
 * request is validated.
 */
function validateWrite(dataDir: string, tenantId: string, op: BookingOp, req: BookingWriteRequest, opts?: { rejectRawIds?: boolean }): void {
  if (opts?.rejectRawIds) {
    // Forged server-side ids on create → 400 BEFORE any normalization.
    if (req.bookingPageId && isBookingPageId(req.bookingPageId)) throw new Error("bookingPageId must not be provided on create");
    if (req.bookingId && isBookingId(req.bookingId)) throw new Error("bookingId must not be provided on create");
  }
  if (op === "create") {
    if (!req.data) throw new Error("booking page data is required");
    if (!req.data.name) throw new Error("name is required");
    const v = validateBookingPageMutation(req.data);
    if (!v.ok) throw new Error(v.error);
    return;
  }
  if (op === "update") {
    if (!req.bookingPageId) throw new Error("bookingPageId is required");
    if (!isBookingPageId(req.bookingPageId)) throw new Error("invalid bookingPageId");
    const page = getBookingPage(dataDir, tenantId, req.bookingPageId);
    if (!page) throw new Error("booking page not found"); // 404-no-IDOR shape
    if (isPageTerminal(page.status)) throw new Error("booking page is archived"); // archived is terminal
    if (!req.data || Object.keys(req.data).length === 0) throw new Error("booking page data is required");
    const v = validateBookingPageMutation(req.data);
    if (!v.ok) throw new Error(v.error);
    return;
  }
  if (op === "publish" || op === "archive" || op === "delete") {
    if (!req.bookingPageId) throw new Error("bookingPageId is required");
    if (!isBookingPageId(req.bookingPageId)) throw new Error("invalid bookingPageId");
    const page = getBookingPage(dataDir, tenantId, req.bookingPageId);
    if (!page) throw new Error("booking page not found");
    if (op === "delete" && page.status !== "draft") throw new Error("only draft booking pages can be deleted");
    if (op === "publish" && isPageTerminal(page.status)) throw new Error("booking page is archived");
    if (op === "archive" && isPageTerminal(page.status)) throw new Error("booking page is already archived");
    return;
  }
  if (op === "request") {
    // Client lane: page must exist, be published, and the slot MUST be free NOW.
    if (!req.bookingPageId) throw new Error("bookingPageId is required");
    if (!isBookingPageId(req.bookingPageId)) throw new Error("invalid bookingPageId");
    const page = getBookingPage(dataDir, tenantId, req.bookingPageId);
    if (!page) throw new Error("booking page not found");
    if (page.status !== "published") throw new Error("booking page is not accepting bookings");
    if (!req.request) throw new Error("booking request is required");
    const v = validateBookingRequestInput(req.request);
    if (!v.ok) throw new Error(v.error);
    if (!isSlotAvailable(page, listBookingsForPage(dataDir, tenantId, page.id), v.data!.startAt)) {
      throw new Error("that time slot is no longer available");
    }
    return;
  }
  if (op === "confirm" || op === "cancel") {
    if (!req.bookingId) throw new Error("bookingId is required");
    if (!isBookingId(req.bookingId)) throw new Error("invalid bookingId");
    const booking = getBooking(dataDir, tenantId, req.bookingId);
    if (!booking) throw new Error("booking not found");
    if (op === "confirm" && booking.status !== "requested") throw new Error(`only requested bookings can be confirmed (current: ${booking.status})`);
    if (op === "cancel" && isBookingTerminal(booking.status)) throw new Error("booking is already cancelled");
    const page = getBookingPage(dataDir, tenantId, booking.bookingPageId);
    if (!page) throw new Error("booking page not found");
    return;
  }
  throw new Error(`unknown booking op: ${op}`);
}

type AppliedOp =
  | { kind: "page"; page: BookingPageRecord }
  | { kind: "booking"; booking: BookingRecord };

function applyMutation(dataDir: string, tenantId: string, op: BookingOp, req: BookingWriteRequest, mutation: BookingPageMutation, actor: string): AppliedOp {
  const now = new Date().toISOString();
  if (op === "create") {
    const slug = generateBookingSlug();
    const record: BookingPageRecord = {
      id: generateBookingEntityId("bkg"),
      tenantId,
      name: mutation.name!.trim(),
      description: mutation.description ?? "",
      slug,
      timeZone: mutation.timeZone ?? "UTC",
      slotDurationMinutes: mutation.slotDurationMinutes ?? 30,
      bufferMinutes: mutation.bufferMinutes ?? 0,
      team: mutation.team ?? [],
      availability: mutation.availability ?? [],
      rrIndex: 0,
      status: "draft",
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    insertBookingPage(dataDir, record); // throws at cap — never silently truncates
    registerBookingSlug(dataDir, slug, tenantId);
    appendAudit(dataDir, { tenantId, actor, action: "native.booking.page.created", bookingPageId: record.id, detail: `Created booking page "${record.name}" (draft)` });
    publishEvent(dataDir, tenantId, "native.booking.page.created", { bookingPageId: record.id, name: record.name, status: "draft" });
    return { kind: "page", page: record };
  }
  if (op === "delete") {
    const page = getBookingPage(dataDir, tenantId, req.bookingPageId!)!;
    if (page.slug) unregisterBookingSlug(dataDir, page.slug);
    appendAudit(dataDir, { tenantId, actor, action: "native.booking.page.deleted", bookingPageId: page.id, detail: `Deleted booking page "${page.name}"` });
    removeBookingPage(dataDir, tenantId, page.id);
    publishEvent(dataDir, tenantId, "native.booking.page.deleted", { bookingPageId: page.id, name: page.name });
    return { kind: "page", page: { ...page, status: "deleted" } as unknown as BookingPageRecord };
  }
  if (op === "request") {
    const page = getBookingPage(dataDir, tenantId, req.bookingPageId!)!;
    const request = req.request!;
    const endAt = bookingEndIso(page, request.startAt);
    // RE-CHECK availability at apply (idempotent-safe; a slot taken since the
    // client requested fails the apply — never double-booked).
    if (!isSlotAvailable(page, listBookingsForPage(dataDir, tenantId, page.id), request.startAt)) {
      throw new Error("that time slot is no longer available — it may have just been booked");
    }
    if (countBookingsForPage(dataDir, tenantId, page.id) >= MAX_BOOKINGS_PER_PAGE) {
      throw new Error(`booking cap reached for this page (${MAX_BOOKINGS_PER_PAGE})`);
    }
    const record: BookingRecord = {
      id: generateBookingEntityId("apt"),
      tenantId,
      bookingPageId: page.id,
      clientName: request.clientName,
      clientEmail: request.clientEmail,
      startAt: request.startAt,
      endAt,
      status: "requested",
      roundRobinAssignee: null,
      calendarSync: { provider: "google-calendar", status: "not-synced" },
      version: 1,
      createdAt: now,
      createdBy: req.via === "public" ? "client" : actor,
      updatedAt: now,
      updatedBy: actor,
    };
    insertBooking(dataDir, record);
    appendAudit(dataDir, { tenantId, actor: req.via === "public" ? "client" : actor, action: "native.booking.requested", bookingPageId: page.id, bookingId: record.id, detail: `${record.clientName} <${record.clientEmail}> requested ${record.startAt} on "${page.name}"` });
    publishEvent(dataDir, tenantId, "native.booking.requested", { bookingId: record.id, bookingPageId: page.id, clientName: record.clientName, startAt: record.startAt, endAt: record.endAt });
    return { kind: "booking", booking: record };
  }
  if (op === "confirm") {
    const booking = getBooking(dataDir, tenantId, req.bookingId!)!;
    const page = getBookingPage(dataDir, tenantId, booking.bookingPageId)!;
    const assignee = advanceBookingPageRoundRobin(dataDir, tenantId, page.id) ?? null; // round-robin
    const updated = applyBookingMutation(
      dataDir,
      tenantId,
      booking.id,
      { status: "confirmed", roundRobinAssignee: assignee, calendarSync: { provider: "google-calendar", status: "pending" } },
      actor,
    )!;
    const payload = bookingCalendarEventPayload(page, updated);
    appendAudit(dataDir, { tenantId, actor, action: "native.booking.confirmed", bookingPageId: page.id, bookingId: updated.id, detail: `Confirmed ${updated.startAt} for ${updated.clientName}${assignee ? ` · assigned to ${assignee} (round-robin)` : ""} · calendar sync pending via Google Calendar adapter` });
    publishEvent(dataDir, tenantId, "native.booking.confirmed", { bookingId: updated.id, bookingPageId: page.id, clientName: updated.clientName, clientEmail: updated.clientEmail, startAt: updated.startAt, endAt: updated.endAt, roundRobinAssignee: assignee, calendarSync: updated.calendarSync, calendarEvent: payload });
    return { kind: "booking", booking: updated };
  }
  if (op === "cancel") {
    const booking = getBooking(dataDir, tenantId, req.bookingId!)!;
    const page = getBookingPage(dataDir, tenantId, booking.bookingPageId)!;
    const updated = applyBookingMutation(dataDir, tenantId, booking.id, { status: "cancelled" }, actor)!;
    appendAudit(dataDir, { tenantId, actor, action: "native.booking.cancelled", bookingPageId: page.id, bookingId: updated.id, detail: `Cancelled ${updated.startAt} booking for ${updated.clientName}` });
    publishEvent(dataDir, tenantId, "native.booking.cancelled", { bookingId: updated.id, bookingPageId: page.id, clientName: updated.clientName, startAt: updated.startAt });
    return { kind: "booking", booking: updated };
  }
  if (op === "publish" || op === "archive" || op === "update") {
    const page = getBookingPage(dataDir, tenantId, req.bookingPageId!)!;
    const nextStatus = op === "publish" ? "published" : op === "archive" ? "archived" : page.status;
    const record = applyBookingPageMutation(dataDir, tenantId, page.id, mutation, op === "update" ? null : nextStatus, actor)!;
    const auditAction = op === "publish" ? "native.booking.page.published" : op === "archive" ? "native.booking.page.archived" : "native.booking.page.updated";
    appendAudit(dataDir, { tenantId, actor, action: auditAction, bookingPageId: record.id, detail: `${op === "publish" ? "Published" : op === "archive" ? "Archived" : "Updated"} booking page "${record.name}" → ${record.status}` });
    publishEvent(dataDir, tenantId, auditAction, { bookingPageId: record.id, name: record.name, status: record.status, changed: op === "update" ? Object.keys(req.data ?? {}) : undefined });
    return { kind: "page", page: record };
  }
  throw new Error(`unknown booking op: ${op}`);
}

/** Submit a booking write. Validation FIRST — invalid writes 400 before the queue. */
export function submitBookingWrite(dataDir: string, tenantId: string, op: BookingOp, req: BookingWriteRequest, actor: string): BookingWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  try {
    validateWrite(dataDir, tenantId, op, req, op === "create" ? { rejectRawIds: true } : {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = ACTION_NAME[op];
  const params: Record<string, any> = {
    bookingPageId: req.bookingPageId ?? "__create__",
    bookingId: req.bookingId ?? undefined,
    op,
    via: req.via ?? "portal",
  };
  const gate = approvalGate(tenantId, action, "native-bookings", params, { dataDir, workflowId: "native-bookings" });
  if (gate.allowed) {
    try {
      const applied = applyMutation(dataDir, tenantId, op, req, req.data ?? {}, actor);
      if (gate.autonomy && op !== "delete" && op !== "cancel") {
        try {
          recordAutonomyOutcome(tenantId, gate.workflowId || "native-bookings", action, "native-bookings", true, { dataDir, allowListId: gate.allowListId });
        } catch { /* outcome recording never blocks the already-authorized write */ }
      }
      return {
        applied: true,
        pending: false,
        ...(applied.kind === "page" ? { page: applied.page } : { booking: applied.booking }),
        op,
        autonomy: !!gate.autonomy,
        actionId: gate.actionId,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { applied: false, pending: false, error: msg };
    }
  }
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  const pending = listPendingWrites(dataDir, tenantId);
  if (pending.length >= MAX_PENDING_BOOKING_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_BOOKING_WRITES}) — approve or reject before writing more` };
  }
  // Dedupe: one pending confirm per booking (like proposals' no double-decide).
  if (op === "confirm" || op === "cancel") {
    const existing = pending.find((w) => w.status === "pending" && w.op === op && w.bookingId === (req.bookingId ?? null));
    if (existing) return { applied: false, pending: true, approvalActionId: existing.approvalActionId, op };
  }
  const ptw: PendingBookingWrite = {
    id: generateBookingEntityId("bkw"),
    tenantId,
    bookingPageId: req.bookingPageId ?? null,
    bookingId: req.bookingId ?? null,
    op,
    payload: { data: req.data, request: req.request, via: req.via ?? "portal" },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: "native.booking.pending", bookingPageId: req.bookingPageId ?? "", bookingId: req.bookingId ?? "", detail: `Queued ${action} for approval (${ptw.id})` });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Approve-path executor: applies the pending write the approval card authorized. */
export function executePendingBookingWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; page?: BookingPageRecord; booking?: BookingRecord; ptwId: string; op: BookingOp; alreadyApplied?: boolean } | { ok: false; reason: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const ptw = listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status !== "pending" && ptw.status !== "applied") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied" && ptw.appliedResult?.bookingId) {
    const rec = getBooking(dataDir, tenantId, ptw.appliedResult.bookingId);
    if (rec) return { ok: true, alreadyApplied: true, booking: rec, ptwId: ptw.id, op: ptw.op };
    return { ok: false, reason: "already applied but booking record missing" };
  }
  try {
    // Re-validate at apply (fail-closed): the slot may have been taken since.
    validateWrite(dataDir, tenantId, ptw.op, { bookingPageId: ptw.bookingPageId ?? undefined, bookingId: ptw.bookingId ?? undefined, data: ptw.payload.data, request: ptw.payload.request, via: ptw.payload.via });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
  try {
    const applied = applyMutation(dataDir, tenantId, ptw.op, { bookingPageId: ptw.bookingPageId ?? undefined, bookingId: ptw.bookingId ?? undefined, data: ptw.payload.data, request: ptw.payload.request, via: ptw.payload.via }, ptw.payload.data ?? {}, actor);
    markPendingWrite(dataDir, tenantId, ptw.id, "applied", actor, { status: applied.kind === "page" ? applied.page.status : applied.booking.status, bookingPageId: applied.kind === "page" ? applied.page.id : applied.booking.bookingPageId, bookingId: applied.kind === "booking" ? applied.booking.id : undefined });
    return { ok: true, ...(applied.kind === "page" ? { page: applied.page } : { booking: applied.booking }), ptwId: ptw.id, op: ptw.op };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
}

/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const ptw = listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingBookingWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.booking?.status ?? res.page?.status, bookingId: res.booking?.id, bookingPageId: res.booking?.bookingPageId ?? res.page?.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", owner);
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

export { createBookingPageMutationFromInput, listBookingPages, listBookings };

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-bookings");
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}