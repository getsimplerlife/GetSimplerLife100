/**
 * native/dealroom/gate.ts — GATED WRITE PATH for deal rooms (Phase 2.4).
 *
 * Mirrors the Phase 2.1/2.3 gates exactly:
 *   - validation happens BEFORE the gate (a never-valid write never queues),
 *   - every write action rides the Approval Queue (#164) by default through
 *     approvalGate(tenantId, actionName, "native-dealrooms", params, …),
 *   - autonomy (#236): an explicit allow-listed entry auto-applies; globs can
 *     NEVER approve/delete (destructive ops need exact ids),
 *   - a durable pending-write mirror lands with each approval card (tenant
 *     record untouched until apply), and the approve-path executor applies
 *     idempotently (replay → alreadyApplied),
 *   - every apply appends an immutable native.dealroom.* audit entry,
 *   - linked proposal/checklist ids are validated to EXIST IN THE TENANT
 *     before anything queues (fail-closed refs — unknown ids → 400),
 *   - status lifecycle draft → active → archived is fail-closed (update only
 *     moves draft↔active; archive only from draft|active; archived is
 *     terminal except delete),
 *   - ACTION NAMES ARE VERB-FIRST (createDealRoom/updateDealRoom/
 *     archiveDealRoom/deleteDealRoom) so isWriteAction classifies them as
 *     writes — a verb-last name would BYPASS the gate (fail-open).
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import { getProposal } from "../proposals/store";
import { getChecklist } from "../checklists/store";
import {
  insertDealRoom,
  getDealRoom,
  applyDealRoomMutation,
  removeDealRoom,
  listPendingWrites,
  savePendingWrite,
  markPendingWrite,
  appendAudit,
  generateDealRoomEntityId,
  generateDealRoomSlug,
  registerDealRoomSlug,
  unregisterDealRoomSlug,
} from "./store";
import { validateDealRoomMutation, createDealRoomMutationFromInput, isDealRoomId } from "./validate";
import {
  MAX_PENDING_DEAL_ROOM_WRITES,
  type DealRoomMutation,
  type DealRoomOp,
  type DealRoomRecord,
  type DealRoomStatus,
  type PendingDealRoomWrite,
} from "./types";

export type DealRoomWriteRequest = {
  dealRoomId?: string; // null for create
  data?: DealRoomMutation;
  via?: string; // "portal"
};

export type DealRoomWriteResult =
  | { applied: true; pending: false; dealRoom: DealRoomRecord; op: DealRoomOp; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: DealRoomOp }
  | { applied: false; pending: false; error: string };

const ACTION_NAME: Record<DealRoomOp, string> = {
  create: "createDealRoom",
  update: "updateDealRoom",
  archive: "archiveDealRoom",
  delete: "deleteDealRoom",
};

/** Status transition allowed from a given current status (fail-closed). */
function statusFor(op: DealRoomOp, current: DealRoomStatus, requested?: DealRoomStatus): DealRoomStatus | null {
  switch (op) {
    case "create":
      return "draft";
    case "update":
      // Updates carry an optional status that may only move draft↔active.
      if (current === "archived") return null; // archived is terminal — no updates at all
      if (requested === undefined) return current;
      if (requested === current) return current; // no-op allowed
      if (current === "draft" && requested === "active") return "active";
      if (current === "active" && requested === "draft") return "draft";
      return null; // any other transition (e.g. → archived) is illegal here
    case "archive":
      return current === "draft" || current === "active" ? "archived" : null;
    case "delete":
      return null; // removal handled separately
    default:
      return null;
  }
}

/** Validate the write intent BEFORE the gate — throws on invalid (→ 400). */
function validateWrite(
  dataDir: string,
  tenantId: string,
  op: DealRoomOp,
  req: DealRoomWriteRequest,
  opts: { rejectRawIds?: boolean } = {},
): { mutation: DealRoomMutation; nextStatus: DealRoomStatus } {
  if (op === "create") {
    const data = req.data ?? {};
    if (data.status !== undefined) throw new Error("status must not be set on create (rooms always start as draft)");
    const v = validateDealRoomMutation(data, { requireName: true });
    if (!v.ok) throw new Error(v.error);
    // Fail-closed: a brand-new deal room has no record yet, so a client-supplied
    // id on create is by definition forged — reject the RAW user input before
    // any normalization (checklists 2.3 rejectRawIds pattern).
    if (opts.rejectRawIds && (data as Record<string, unknown>).id !== undefined) {
      throw new Error("invalid id on create (ids are server-assigned)");
    }
    // Linked refs must exist IN THIS TENANT before anything queues.
    const proposal = getProposal(dataDir, tenantId, data.linkedProposalId!);
    if (!proposal) throw new Error("invalid linkedProposalId (unknown id)");
    if (data.linkedChecklistId) {
      const checklist = getChecklist(dataDir, tenantId, data.linkedChecklistId);
      if (!checklist) throw new Error("invalid linkedChecklistId (unknown id)");
    }
    const mutation: DealRoomMutation = {
      name: (v.data?.name ?? "").slice(0, 200),
      customerName: (v.data?.customerName ?? "").slice(0, 200),
      customerEmail: (v.data?.customerEmail ?? "").slice(0, 200),
      description: data.description ?? "",
      linkedProposalId: data.linkedProposalId!,
      linkedChecklistId: data.linkedChecklistId ?? null,
    };
    const v2 = validateDealRoomMutation(mutation, { requireName: true });
    if (!v2.ok) throw new Error(v2.error);
    return { mutation, nextStatus: "draft" as const };
  }
  if (!isDealRoomId(req.dealRoomId)) throw new Error("deal room id is required");
  const dealRoom = getDealRoom(dataDir, tenantId, req.dealRoomId);
  if (!dealRoom) throw new Error("deal room not found");
  if (op === "delete") return { mutation: {}, nextStatus: dealRoom.status };
  const nextStatus = statusFor(op, dealRoom.status, op === "update" ? req.data?.status : undefined);
  if (nextStatus === null) throw new Error(`cannot ${op} a deal room in status ${dealRoom.status}`);
  let mutation: DealRoomMutation = {};
  if (op === "update") {
    const data = req.data ?? {};
    const v = validateDealRoomMutation(data);
    if (!v.ok) throw new Error(v.error);
    mutation = { ...(v.data ?? {}) };
    // Linked-ref existence re-checked on the merged target state.
    const proposalId = mutation.linkedProposalId !== undefined ? mutation.linkedProposalId : dealRoom.linkedProposalId;
    if (!proposalId || !getProposal(dataDir, tenantId, proposalId)) throw new Error("invalid linkedProposalId (unknown id)");
    if (mutation.linkedChecklistId !== undefined && mutation.linkedChecklistId !== null) {
      if (!getChecklist(dataDir, tenantId, mutation.linkedChecklistId)) throw new Error("invalid linkedChecklistId (unknown id)");
    } else if (mutation.linkedChecklistId === undefined && dealRoom.linkedChecklistId) {
      if (!getChecklist(dataDir, tenantId, dealRoom.linkedChecklistId)) throw new Error("invalid linkedChecklistId (unknown id)");
    }
  }
  return { mutation, nextStatus };
}

/** Apply a validated write to the store + audit + typed event. */
function applyMutation(
  dataDir: string,
  tenantId: string,
  op: DealRoomOp,
  req: DealRoomWriteRequest,
  mutation: DealRoomMutation,
  nextStatus: DealRoomStatus,
  actor: string,
): DealRoomRecord {
  if (op === "create") {
    const now = new Date().toISOString();
    const slug = generateDealRoomSlug();
    const record: DealRoomRecord = {
      id: generateDealRoomEntityId("dea"),
      tenantId,
      name: mutation.name!,
      customerName: mutation.customerName!,
      customerEmail: mutation.customerEmail!,
      description: mutation.description ?? "",
      linkedProposalId: mutation.linkedProposalId!,
      linkedChecklistId: mutation.linkedChecklistId ?? null,
      status: "draft",
      shareSlug: slug,
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    insertDealRoom(dataDir, record);
    registerDealRoomSlug(dataDir, slug, tenantId);
    appendAudit(dataDir, { tenantId, actor, action: "native.dealroom.create", dealRoomId: record.id, detail: `Created deal room "${record.name}" for ${record.customerName} (proposal ${record.linkedProposalId})` });
    publishEvent(dataDir, tenantId, "native.dealroom.created", { dealRoomId: record.id, name: record.name, customerName: record.customerName, linkedProposalId: record.linkedProposalId, status: record.status });
    return record;
  }
  if (op === "delete") {
    const d = getDealRoom(dataDir, tenantId, req.dealRoomId!)!;
    if (d.shareSlug) unregisterDealRoomSlug(dataDir, d.shareSlug);
    appendAudit(dataDir, { tenantId, actor, action: "native.dealroom.delete", dealRoomId: d.id, detail: `Deleted deal room "${d.name}" (proposal ${d.linkedProposalId})` });
    removeDealRoom(dataDir, tenantId, d.id);
    publishEvent(dataDir, tenantId, "native.dealroom.deleted", { dealRoomId: d.id, name: d.name });
    return { ...d, status: "deleted" } as unknown as DealRoomRecord;
  }
  const record = applyDealRoomMutation(dataDir, tenantId, req.dealRoomId!, mutation, nextStatus, actor)!;
  if (!record) throw new Error("deal room not found");
  if (op === "archive") {
    appendAudit(dataDir, { tenantId, actor, action: "native.dealroom.archive", dealRoomId: record.id, detail: `Archived deal room "${record.name}"` });
    publishEvent(dataDir, tenantId, "native.dealroom.archived", { dealRoomId: record.id, name: record.name, status: "archived" });
  } else if (op === "update") {
    appendAudit(dataDir, { tenantId, actor, action: "native.dealroom.update", dealRoomId: record.id, detail: `Updated deal room "${record.name}" → ${record.status}` });
    publishEvent(dataDir, tenantId, "native.dealroom.updated", { dealRoomId: record.id, name: record.name, status: record.status, changed: Object.keys(req.data ?? {}) });
  }
  return record;
}

/**
 * Submit a deal room write. Validation FIRST — invalid writes 400 and never
 * reach the queue. Then the gate: allow-listed autonomy applies immediately;
 * otherwise a durable pending-write mirror + approval card are created.
 */
export function submitDealRoomWrite(
  dataDir: string,
  tenantId: string,
  op: DealRoomOp,
  req: DealRoomWriteRequest,
  actor: string,
): DealRoomWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  let validated: { mutation: DealRoomMutation; nextStatus: DealRoomStatus };
  try {
    validated = validateWrite(dataDir, tenantId, op, req, op === "create" ? { rejectRawIds: true } : {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = ACTION_NAME[op];
  const params: Record<string, any> = {
    dealRoomId: req.dealRoomId ?? "__create__",
    op,
    via: req.via ?? "portal",
  };
  if (op === "delete" && !getDealRoom(dataDir, tenantId, req.dealRoomId ?? "")) return { applied: false, pending: false, error: "deal room not found" };
  const gate = approvalGate(tenantId, action, "native-dealrooms", params, { dataDir, workflowId: "native-dealrooms" });
  if (gate.allowed) {
    try {
      const record = applyMutation(dataDir, tenantId, op, req, validated.mutation, validated.nextStatus, actor);
      if (gate.autonomy && !op.startsWith("delete")) {
        try {
          recordAutonomyOutcome(tenantId, gate.workflowId || "native-dealrooms", action, "native-dealrooms", true, { dataDir, allowListId: gate.allowListId });
        } catch { /* outcome recording never blocks the already-authorized write */ }
      }
      return { applied: true, pending: false, dealRoom: record, op, autonomy: !!gate.autonomy, actionId: gate.actionId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { applied: false, pending: false, error: msg };
    }
  }
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  const pending = listPendingWrites(dataDir, tenantId);
  if (pending.length >= MAX_PENDING_DEAL_ROOM_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_DEAL_ROOM_WRITES}) — approve or reject before writing more` };
  }
  if (op === "update" || op === "archive") {
    const existing = pending.find((w) => w.status === "pending" && w.op === op && w.dealRoomId === (req.dealRoomId ?? null));
    if (existing) return { applied: false, pending: true, approvalActionId: existing.approvalActionId, op };
  }
  const ptw: PendingDealRoomWrite = {
    id: generateDealRoomEntityId("dlw"),
    tenantId,
    dealRoomId: req.dealRoomId ?? null,
    op,
    payload: { data: validated.mutation, via: req.via ?? "portal" },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: "native.dealroom.pending", dealRoomId: req.dealRoomId ?? "", detail: `Queued ${action} for approval (${ptw.id})` });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Approve-path executor: applies the pending write the approval card authorized. */
export function executePendingDealRoomWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; record: DealRoomRecord; ptwId: string; op: DealRoomOp; alreadyApplied?: boolean } | { ok: false; reason: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const stateWrites = listPendingWrites(dataDir, tenantId);
  const ptw = stateWrites.find((w) => w.approvalActionId === approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status !== "pending" && ptw.status !== "applied") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied" && ptw.appliedResult?.dealRoomId) {
    const rec = getDealRoom(dataDir, tenantId, ptw.appliedResult.dealRoomId);
    if (rec) return { ok: true, alreadyApplied: true, record: rec, ptwId: ptw.id, op: ptw.op };
    return { ok: false, reason: "already applied but deal room record missing" };
  }
  let validated: { mutation: DealRoomMutation; nextStatus: DealRoomStatus };
  try {
    validated = validateWrite(dataDir, tenantId, ptw.op, { dealRoomId: ptw.dealRoomId ?? undefined, data: ptw.payload.data, via: ptw.payload.via });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
  try {
    const record = applyMutation(dataDir, tenantId, ptw.op, { dealRoomId: ptw.dealRoomId ?? undefined, data: ptw.payload.data, via: ptw.payload.via }, validated.mutation, validated.nextStatus, actor);
    markPendingWrite(dataDir, tenantId, ptw.id, "applied", actor, { status: record.status, dealRoomId: record.id });
    return { ok: true, record, ptwId: ptw.id, op: ptw.op };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
}

/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  decision: "approved" | "rejected",
  owner: string,
): void {
  const ptw = listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingDealRoomWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.record.status, dealRoomId: res.record.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", owner);
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
export { createDealRoomMutationFromInput };

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-dealrooms");
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}