/**
 * native/checklists/gate.ts — GATED WRITE PATH for checklists (Phase 2.3).
 *
 * Mirrors the Phase 2.1 proposals gate exactly:
 *   - validation happens BEFORE the gate (a never-valid write never queues),
 *   - every write action rides the Approval Queue (#164) by default through
 *     approvalGate(tenantId, actionName, "native-checklists", params, …),
 *   - autonomy (#236): an explicit allow-listed entry auto-applies; globs can
 *     NEVER approve/delete (destructive ops need exact ids),
 *   - a durable pending-write mirror lands with each approval card (tenant
 *     record untouched until apply), and the approve-path executor applies
 *     idempotently (replay → alreadyApplied),
 *   - every apply appends an immutable native.checklist.* audit entry,
 *   - ACTION NAMES ARE VERB-FIRST (createChecklist/updateChecklist/
 *     closeChecklist/deleteChecklist) so isWriteAction classifies them as
 *     writes — a verb-last name would BYPASS the gate (fail-open).
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  insertChecklist,
  getChecklist,
  applyChecklistMutation,
  removeChecklist,
  listPendingWrites,
  savePendingWrite,
  markPendingWrite,
  appendAudit,
  generateChecklistEntityId,
} from "./store";
import { validateChecklistMutation, normalizeItems, createMutationFromInput } from "./validate";
import {
  MAX_PENDING_CHECKLIST_WRITES,
  type ChecklistMutation,
  type ChecklistOp,
  type ChecklistRecord,
  type ChecklistStatus,
  type PendingChecklistWrite,
} from "./types";

export type ChecklistWriteRequest = {
  checklistId?: string; // null for create
  data?: ChecklistMutation;
  via?: string; // "portal"
};

export type ChecklistWriteResult =
  | { applied: true; pending: false; checklist: ChecklistRecord; op: ChecklistOp; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: ChecklistOp }
  | { applied: false; pending: false; error: string };

const ACTION_NAME: Record<ChecklistOp, string> = {
  create: "createChecklist",
  update: "updateChecklist",
  close: "closeChecklist",
  delete: "deleteChecklist",
};

/** Status transition allowed from a given current status (fail-closed). */
function statusFor(op: ChecklistOp, current: ChecklistStatus): ChecklistStatus | null {
  switch (op) {
    case "create":
      return "open";
    case "update":
      return current === "open" ? "open" : null;
    case "close":
      return current === "open" ? "closed" : null;
    case "delete":
      return null; // removal handled separately
    default:
      return null;
  }
}

/** Validate the write intent BEFORE the gate — throws on invalid (→ 400). */
function validateWrite(dataDir: string, tenantId: string, op: ChecklistOp, req: ChecklistWriteRequest, opts: { rejectRawIds?: boolean } = {}): { mutation: ChecklistMutation; nextStatus: ChecklistStatus } {
  if (op === "create") {
    const data = req.data ?? {};
    const v = validateChecklistMutation(data, { requireItems: true });
    if (!v.ok) throw new Error(v.error);
    if (!Array.isArray(data.items) || data.items.length < 1) throw new Error("items must be an array of 1..50 valid items");
    // Fail-closed: a brand-new checklist has no item rows yet, so a client-supplied
    // id on create is by definition forged — reject the RAW user input before any
    // normalization assigns server ids (otherwise every item would look "forged").
    // Only runs on the raw submission path; the pending-apply path re-validates the
    // already-sanitized mutation (which legitimately carries server cli_ ids).
    if (opts.rejectRawIds) {
      for (const raw of data.items as unknown[]) {
        if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw as Record<string, unknown>).id !== undefined) {
          throw new Error("invalid item id on create (ids are server-assigned)");
        }
      }
    }
    const items = normalizeItems(data.items);
    if (items === null) throw new Error("items must be an array of 1..50 valid items");
    const mutation: ChecklistMutation = {
      name: (v.data?.name ?? data.name ?? "").slice(0, 200),
      description: data.description ?? "",
      kind: (data.kind ?? "delivery") as ChecklistRecord["kind"],
      linkedProposalId: data.linkedProposalId === undefined ? null : (data.linkedProposalId ?? null),
      items,
    };
    if (!mutation.name?.trim()) throw new Error("name is required");
    const v2 = validateChecklistMutation(mutation, { requireItems: true });
    if (!v2.ok) throw new Error(v2.error);
    return { mutation, nextStatus: "open" };
  }
  if (typeof req.checklistId !== "string" || !req.checklistId.startsWith("chk_")) throw new Error("checklist id is required");
  const checklist = getChecklist(dataDir, tenantId, req.checklistId);
  if (!checklist) throw new Error("checklist not found");
  if (op === "delete") return { mutation: {}, nextStatus: checklist.status };
  const nextStatus = statusFor(op, checklist.status);
  if (nextStatus === null) throw new Error(`cannot ${op} a checklist in status ${checklist.status}`);
  let mutation: ChecklistMutation = {};
  if (op === "update") {
    const data = req.data ?? {};
    const v = validateChecklistMutation(data);
    if (!v.ok) throw new Error(v.error);
    mutation = { ...(v.data ?? {}) };
    // Forged items: every incoming cli_ id must exist on the CURRENT checklist.
    if (mutation.items !== undefined) {
      const existing = new Set(checklist.items.map((i) => i.id));
      for (const it of mutation.items) {
        if (it.id !== undefined && !existing.has(it.id)) throw new Error("invalid item id in update (unknown id)");
      }
    }
  }
  return { mutation, nextStatus };
}

/** Apply a validated write to the store + audit + typed event. */
function applyMutation(
  dataDir: string,
  tenantId: string,
  op: ChecklistOp,
  req: ChecklistWriteRequest,
  mutation: ChecklistMutation,
  nextStatus: ChecklistStatus,
  actor: string,
): ChecklistRecord {
  if (op === "create") {
    const now = new Date().toISOString();
    const record: ChecklistRecord = {
      id: generateChecklistEntityId("chk"),
      tenantId,
      name: mutation.name!,
      description: mutation.description ?? "",
      kind: (mutation.kind ?? "delivery") as ChecklistRecord["kind"],
      linkedProposalId: mutation.linkedProposalId ?? null,
      items: (mutation.items ?? []).map((it) => ({ id: it.id!, title: it.title, status: it.status, ...(it.assignee ? { assignee: it.assignee } : {}) })),
      status: "open",
      progress: { done: 0, total: (mutation.items ?? []).length },
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    insertChecklist(dataDir, record);
    appendAudit(dataDir, { tenantId, actor, action: "native.checklist.create", checklistId: record.id, detail: `Created checklist "${record.name}" (${record.items.length} items)` });
    publishEvent(dataDir, tenantId, "native.checklist.created", { checklistId: record.id, name: record.name, kind: record.kind, items: record.items.length });
    return record;
  }
  if (op === "delete") {
    const c = getChecklist(dataDir, tenantId, req.checklistId!)!;
    appendAudit(dataDir, { tenantId, actor, action: "native.checklist.delete", checklistId: c.id, detail: `Deleted checklist "${c.name}" (${c.items.length} items)` });
    removeChecklist(dataDir, tenantId, c.id);
    publishEvent(dataDir, tenantId, "native.checklist.deleted", { checklistId: c.id, name: c.name });
    return { ...c, status: "deleted" } as unknown as ChecklistRecord;
  }
  const record = applyChecklistMutation(dataDir, tenantId, req.checklistId!, mutation, nextStatus, actor)!;
  if (!record) throw new Error("checklist not found");
  if (op === "close") {
    appendAudit(dataDir, { tenantId, actor, action: "native.checklist.close", checklistId: record.id, detail: `Closed checklist "${record.name}" (${record.progress.done}/${record.progress.total} done)` });
    publishEvent(dataDir, tenantId, "native.checklist.closed", { checklistId: record.id, name: record.name, progress: record.progress });
  } else if (op === "update") {
    appendAudit(dataDir, { tenantId, actor, action: "native.checklist.update", checklistId: record.id, detail: `Updated checklist "${record.name}" → ${record.progress.done}/${record.progress.total} done` });
    publishEvent(dataDir, tenantId, "native.checklist.updated", { checklistId: record.id, name: record.name, progress: record.progress, changed: Object.keys(req.data ?? {}) });
  }
  return record;
}

/**
 * Submit a checklist write. Validation FIRST — invalid writes 400 and never
 * reach the queue. Then the gate: allow-listed autonomy applies immediately;
 * otherwise a durable pending-write mirror + approval card are created.
 */
export function submitChecklistWrite(
  dataDir: string,
  tenantId: string,
  op: ChecklistOp,
  req: ChecklistWriteRequest,
  actor: string,
): ChecklistWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  let validated: { mutation: ChecklistMutation; nextStatus: ChecklistStatus };
  try {
    validated = validateWrite(dataDir, tenantId, op, req, op === "create" ? { rejectRawIds: true } : {});
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = ACTION_NAME[op];
  const params: Record<string, any> = {
    checklistId: req.checklistId ?? "__create__",
    op,
    via: req.via ?? "portal",
  };
  if (op === "delete" && !getChecklist(dataDir, tenantId, req.checklistId ?? "")) return { applied: false, pending: false, error: "checklist not found" };
  const gate = approvalGate(tenantId, action, "native-checklists", params, { dataDir, workflowId: "native-checklists" });
  if (gate.allowed) {
    try {
      const record = applyMutation(dataDir, tenantId, op, req, validated.mutation, validated.nextStatus, actor);
      if (gate.autonomy && !op.startsWith("delete")) {
        try {
          recordAutonomyOutcome(tenantId, gate.workflowId || "native-checklists", action, "native-checklists", true, { dataDir, allowListId: gate.allowListId });
        } catch { /* outcome recording never blocks the already-authorized write */ }
      }
      return { applied: true, pending: false, checklist: record, op, autonomy: !!gate.autonomy, actionId: gate.actionId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { applied: false, pending: false, error: msg };
    }
  }
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  const pending = listPendingWrites(dataDir, tenantId);
  if (pending.length >= MAX_PENDING_CHECKLIST_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_CHECKLIST_WRITES}) — approve or reject before writing more` };
  }
  if (op === "update" || op === "close") {
    const existing = pending.find((w) => w.status === "pending" && w.op === op && w.checklistId === (req.checklistId ?? null));
    if (existing) return { applied: false, pending: true, approvalActionId: existing.approvalActionId, op };
  }
  const ptw: PendingChecklistWrite = {
    id: generateChecklistEntityId("clw"),
    tenantId,
    checklistId: req.checklistId ?? null,
    op,
    payload: { data: validated.mutation, via: req.via ?? "portal" },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: "native.checklist.pending", checklistId: req.checklistId ?? "", detail: `Queued ${action} for approval (${ptw.id})` });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Approve-path executor: applies the pending write the approval card authorized. */
export function executePendingChecklistWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; record: ChecklistRecord; ptwId: string; op: ChecklistOp; alreadyApplied?: boolean } | { ok: false; reason: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const stateWrites = listPendingWrites(dataDir, tenantId);
  const ptw = stateWrites.find((w) => w.approvalActionId === approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status !== "pending" && ptw.status !== "applied") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied" && ptw.appliedResult?.checklistId) {
    const rec = getChecklist(dataDir, tenantId, ptw.appliedResult.checklistId);
    if (rec) return { ok: true, alreadyApplied: true, record: rec, ptwId: ptw.id, op: ptw.op };
    return { ok: false, reason: "already applied but checklist record missing" };
  }
  let validated: { mutation: ChecklistMutation; nextStatus: ChecklistStatus };
  try {
    validated = validateWrite(dataDir, tenantId, ptw.op, { checklistId: ptw.checklistId ?? undefined, data: ptw.payload.data, via: ptw.payload.via });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
  try {
    const record = applyMutation(dataDir, tenantId, ptw.op, { checklistId: ptw.checklistId ?? undefined, data: ptw.payload.data, via: ptw.payload.via }, validated.mutation, validated.nextStatus, actor);
    markPendingWrite(dataDir, tenantId, ptw.id, "applied", actor, { status: record.status, checklistId: record.id });
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
    const res = executePendingChecklistWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.record.status, checklistId: res.record.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", owner);
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
export { createMutationFromInput };

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-checklists");
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}