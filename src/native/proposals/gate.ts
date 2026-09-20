/**
 * native/proposals/gate.ts — GATED WRITE PATH for proposals (Phase 2.1).
 *
 * Mirrors the Phase 1.4 tables gate exactly:
 *   - validation happens BEFORE the gate (a never-valid write never queues),
 *   - every write action rides the Approval Queue (#164) by default through
 *     approvalGate(tenantId, actionName, "native-proposals", params, …),
 *   - autonomy (#236): an explicit allow-listed entry auto-applies; globs can
 *     NEVER approve/delete (destructive ops need exact ids),
 *   - a durable pending-write mirror lands with each approval card (tenant
 *     record untouched until apply), and the approve-path executor applies
 *     idempotently (replay → 200 alreadyApplied),
 *   - every apply appends an immutable native.proposal.* audit entry,
 *   - ACTION NAMES ARE VERB-FIRST (create/update/open/approve/reject/send/
 *     deleteProposal) so isWriteAction classifies them as writes — a
 *     verb-last name (proposalInsert) would BYPASS the gate (fail-open).
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import { generateProposalEntityId, generateShareSlug, insertProposal, applyProposalMutation, listPendingWrites, savePendingWrite, appendAudit, getProposal, registerSlug, unregisterSlug, markPendingWrite, removeProposal } from "./store";
import { validateProposalMutation, normalizeLineItems } from "./validate";
import { renderProposalPdf, storeProposalPdf } from "./generate";
import {
  MAX_PENDING_PROPOSAL_WRITES,
  type ProposalRecord,
  type ProposalMutation,
  type ProposalLineItem,
  type ProposalOp,
  type PendingProposalWrite,
  type ProposalStatus,
} from "./types";

export type ProposalWriteRequest = {
  proposalId?: string; // null for create
  data?: ProposalMutation;
  via?: string; // "portal" | "client-decision"
  signerName?: string;
};

export type ProposalWriteResult =
  | { applied: true; pending: false; proposal: ProposalRecord; op: ProposalOp; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: ProposalOp }
  | { applied: false; pending: false; error: string };

const ACTION_NAME: Record<ProposalOp, string> = {
  create: "createProposal",
  update: "updateProposal",
  open: "openProposal",
  approve: "approveProposal",
  reject: "rejectProposal",
  send: "sendProposal",
  delete: "deleteProposal",
};

/** Status transition allowed from a given current status (fail-closed). */
function statusFor(op: ProposalOp, current: ProposalStatus): ProposalStatus | null {
  switch (op) {
    case "create":
      return "draft";
    case "update":
      return current; // editable only while draft|pending (checked in validateWrite)
    case "open":
      return current === "draft" ? "pending" : null;
    case "approve":
      return current === "draft" || current === "pending" || current === "rejected" ? "approved" : null;
    case "reject":
      return current === "pending" || current === "draft" ? "rejected" : null;
    case "send":
      return current === "approved" ? "sent" : null;
    case "delete":
      return null; // deletion removes the record — handled separately
    default:
      return null;
  }
}

/** Validate the write intent BEFORE the gate — throws on invalid (→ 400). */
function validateWrite(dataDir: string, tenantId: string, op: ProposalOp, req: ProposalWriteRequest): { proposal: ProposalRecord | null; mutation: ProposalMutation; nextStatus: ProposalStatus } {
  if (op === "create") {
    const data = req.data ?? {};
    const v = validateProposalMutation(data);
    if (!v.ok) throw new Error(v.error);
    const items = data.lineItems !== undefined ? normalizeLineItems(data.lineItems) : null;
    if (data.lineItems !== undefined && items === null) throw new Error("lineItems must be an array of {description, qty, unitPrice}");
    const mutation: ProposalMutation = {
      title: data.title ?? "Untitled proposal",
      clientName: data.clientName ?? "",
      clientEmail: data.clientEmail ?? "",
      clientCompany: data.clientCompany ?? "",
      lineItems: (items ?? []) as ProposalLineItem[],
      currency: data.currency ?? "USD",
      terms: data.terms ?? "",
      validityDays: data.validityDays ?? 30,
    };
    // create requires title + clientName + ≥1 line item (record must be viable).
    if (!mutation.title?.trim()) throw new Error("title is required");
    if (!mutation.clientName?.trim()) throw new Error("clientName is required");
    if (!mutation.lineItems || mutation.lineItems.length === 0) throw new Error("at least one line item is required");
    const v2 = validateProposalMutation(mutation);
    if (!v2.ok) throw new Error(v2.error);
    return { proposal: null, mutation, nextStatus: "draft" as const };
  }
  // All other ops need an EXISTING, tenant-owned proposal (strangers → 404-ish
  // error thrown; router converts "not found" to 404).
  if (typeof req.proposalId !== "string" || !req.proposalId.startsWith("prop_")) throw new Error("proposal id is required");
  const proposal = getProposal(dataDir, tenantId, req.proposalId);
  if (!proposal) throw new Error("proposal not found");
  if (op === "delete") return { proposal, mutation: {}, nextStatus: proposal.status };
  const nextStatus = statusFor(op, proposal.status);
  if (nextStatus === null) {
    throw new Error(`cannot ${op} a proposal in status ${proposal.status}`);
  }
  let mutation: ProposalMutation = {};
  if (op === "update") {
    const data = req.data ?? {};
    const v = validateProposalMutation(data);
    if (!v.ok) throw new Error(v.error);
    if (proposal.status !== "draft" && proposal.status !== "pending") {
      throw new Error(`cannot update a proposal in status ${proposal.status}`);
    }
    mutation = { ...data };
    if (mutation.lineItems !== undefined) {
      const items = normalizeLineItems(mutation.lineItems);
      if (items === null) throw new Error("lineItems must be an array of {description, qty, unitPrice}");
      mutation.lineItems = items as ProposalLineItem[];
    }
  }
  return { proposal, mutation, nextStatus };
}

/** Apply a validated write to the store + audit + typed event (fire-and-forget). */
function applyMutation(
  dataDir: string,
  tenantId: string,
  op: ProposalOp,
  req: ProposalWriteRequest,
  mutation: ProposalMutation,
  nextStatus: ProposalStatus,
  actor: string,
): ProposalRecord {
  let record: ProposalRecord;
  let docId: string | null = null;
  let slug: string | null = null;
  if (op === "create") {
    const now = new Date().toISOString();
    record = {
      id: generateProposalEntityId("prop"),
      tenantId,
      title: mutation.title!,
      clientName: mutation.clientName!,
      clientEmail: mutation.clientEmail ?? "",
      clientCompany: mutation.clientCompany ?? "",
      lineItems: (mutation.lineItems ?? []) as ProposalLineItem[],
      currency: mutation.currency ?? "USD",
      terms: mutation.terms ?? "",
      validityDays: mutation.validityDays ?? 30,
      shareSlug: null,
      docId: null,
      status: "draft",
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    insertProposal(dataDir, record);
    appendAudit(dataDir, { tenantId, actor, action: "native.proposal.create", proposalId: record.id, detail: `Created draft "${record.title}"` });
    publishEvent(dataDir, tenantId, "native.proposal.created", { proposalId: record.id, title: record.title, clientName: record.clientName, status: record.status });
    return record;
  }
  if (op === "open") {
    // Generate the share PDF + slug (draft → pending).
    const latest = getProposal(dataDir, tenantId, req.proposalId!);
    if (!latest) throw new Error("proposal not found");
    const rendered = renderProposalPdf(latest, { footerText: `Proposal ${latest.id}` });
    docId = storeProposalPdf(dataDir, tenantId, latest, rendered, actor, latest.docId);
    slug = generateShareSlug();
    registerSlug(dataDir, slug, tenantId);
    record = applyProposalMutation(dataDir, tenantId, latest.id, mutation, "pending", actor, { shareSlug: slug, docId })!;
    appendAudit(dataDir, { tenantId, actor, action: "native.proposal.open", proposalId: record.id, detail: `Opened for client review — ${formatCurrencyTotal(record)}` });
    publishEvent(dataDir, tenantId, "native.proposal.updated", { proposalId: record.id, title: record.title, status: "pending", changed: ["status", "shareSlug", "docId"] });
    return record;
  }
  record = applyProposalMutation(dataDir, tenantId, req.proposalId!, mutation, nextStatus, actor, {
  })!;
  if (!record) throw new Error("proposal not found");
  if (op === "send") {
    const rendered = renderProposalPdf(record, { final: true, footerText: `Proposal ${record.id}` });
    const sentDocId = storeProposalPdf(dataDir, tenantId, record, rendered, actor, record.docId);
    const sent = applyProposalMutation(dataDir, tenantId, record.id, {}, "sent", actor, { docId: sentDocId })!;
    appendAudit(dataDir, { tenantId, actor, action: "native.proposal.send", proposalId: sent.id, detail: `Sent final proposal "${sent.title}" (doc ${sentDocId})` });
    publishEvent(dataDir, tenantId, "native.proposal.updated", { proposalId: sent.id, title: sent.title, status: "sent", changed: ["status", "docId"] });
    return sent;
  }
  if (op === "approve") {
    appendAudit(dataDir, { tenantId, actor, action: "native.proposal.approve", proposalId: record.id, detail: `Approved via ${req.via ?? "portal"}${req.signerName ? ` — signed by ${req.signerName}` : ""}` });
    publishEvent(dataDir, tenantId, "native.proposal.approved", { proposalId: record.id, title: record.title, status: "approved", decidedBy: actor, signerName: req.signerName ?? null });
  } else if (op === "reject") {
    appendAudit(dataDir, { tenantId, actor, action: "native.proposal.reject", proposalId: record.id, detail: `Rejected via ${req.via ?? "portal"}${req.signerName ? ` — by ${req.signerName}` : ""}` });
    publishEvent(dataDir, tenantId, "native.proposal.rejected", { proposalId: record.id, title: record.title, status: "rejected", decidedBy: actor, signerName: req.signerName ?? null });
  } else if (op === "update") {
    appendAudit(dataDir, { tenantId, actor, action: "native.proposal.update", proposalId: record.id, detail: `Updated "${record.title}" → ${record.status}` });
    publishEvent(dataDir, tenantId, "native.proposal.updated", { proposalId: record.id, title: record.title, status: record.status, changed: Object.keys(req.data ?? {}) });
  } else if (op === "delete") {
    if (record.shareSlug) unregisterSlug(dataDir, record.shareSlug);
    appendAudit(dataDir, { tenantId, actor, action: "native.proposal.delete", proposalId: record.id, detail: `Deleted "${record.title}"` });
    removeProposal(dataDir, tenantId, record.id);
    return { ...record, status: "deleted" } as unknown as ProposalRecord;
  }
  return record;
}

/**
 * Submit a proposal write. Validation FIRST — invalid writes 400 and never
 * reach the queue. Then the gate: allow-listed autonomy applies immediately;
 * otherwise a durable pending-write mirror + approval card are created.
 */
export function submitProposalWrite(
  dataDir: string,
  tenantId: string,
  op: ProposalOp,
  req: ProposalWriteRequest,
  actor: string,
): ProposalWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  let validated: { proposal: ProposalRecord | null; mutation: ProposalMutation; nextStatus: ProposalStatus };
  try {
    validated = validateWrite(dataDir, tenantId, op, req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = ACTION_NAME[op];
  const params: Record<string, any> = {
    proposalId: req.proposalId ?? "__create__",
    op,
    ...(req.data ?? {}),
    via: req.via ?? "portal",
  };
  // DELETE with an unknown/exact-id guard: autonomy globs may NEVER delete.
  if (op === "delete" && !validated.proposal) return { applied: false, pending: false, error: "proposal not found" };
  const gate = approvalGate(tenantId, action, "native-proposals", params, { dataDir, workflowId: "native-proposals" });
  if (gate.allowed) {
    try {
      const record = applyMutation(dataDir, tenantId, op, req, validated.mutation, validated.nextStatus, actor);
      if (gate.autonomy && !op.startsWith("delete")) {
        try {
          recordAutonomyOutcome(tenantId, gate.workflowId || "native-proposals", action, "native-proposals", true, { dataDir, allowListId: gate.allowListId });
        } catch { /* outcome recording never blocks the already-authorized write */ }
      }
      return { applied: true, pending: false, proposal: record, op, autonomy: !!gate.autonomy, actionId: gate.actionId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { applied: false, pending: false, error: msg };
    }
  }
  // ── Gated: durable pending-write mirror + approval card exist together ──
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  // Client-decision idempotency: if the SAME intent is already pending, don't
  // create a second card — return the existing one (202 stays the same).
  const pending = listPendingWrites(dataDir, tenantId);
  if (pending.length >= MAX_PENDING_PROPOSAL_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_PROPOSAL_WRITES}) — approve or reject before writing more` };
  }
  if (op === "approve" || op === "reject") {
    const existing = pending.find((w) => w.status === "pending" && w.op === op && w.proposalId === (req.proposalId ?? null));
    if (existing) return { applied: false, pending: true, approvalActionId: existing.approvalActionId, op };
  }
  const ptw: PendingProposalWrite = {
    id: generateProposalEntityId("ppw"),
    tenantId,
    proposalId: req.proposalId ?? null,
    op,
    payload: { data: validated.mutation, via: req.via ?? "portal", signerName: req.signerName },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: "native.proposal.pending", proposalId: req.proposalId ?? "", detail: `Queued ${action} for approval (${ptw.id})` });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/**
 * Approve-path executor: applies the pending write the approval card
 * authorized. Idempotent — replay returns the stored result (200).
 */
export function executePendingProposalWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; record: ProposalRecord; ptwId: string; op: ProposalOp; alreadyApplied?: boolean } | { ok: false; reason: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const stateWrites = listPendingWrites(dataDir, tenantId);
  const ptw = stateWrites.find((w) => w.approvalActionId === approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status !== "pending" && ptw.status !== "applied") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied" && ptw.appliedResult?.proposalId) {
    const rec = getProposal(dataDir, tenantId, ptw.appliedResult.proposalId);
    if (rec) return { ok: true, alreadyApplied: true, record: rec, ptwId: ptw.id, op: ptw.op };
    return { ok: false, reason: "already applied but proposal record missing" };
  }
  // Re-validate the snapshot (defense in depth — data may have changed).
  let validated: { proposal: ProposalRecord | null; mutation: ProposalMutation; nextStatus: ProposalStatus };
  try {
    validated = validateWrite(dataDir, tenantId, ptw.op, { proposalId: ptw.proposalId ?? undefined, data: ptw.payload.data, via: ptw.payload.via, signerName: ptw.payload.signerName });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
  try {
    const record = applyMutation(dataDir, tenantId, ptw.op, { proposalId: ptw.proposalId ?? undefined, data: ptw.payload.data, via: ptw.payload.via, signerName: ptw.payload.signerName }, validated.mutation, validated.nextStatus, actor);
    markPendingWrite(dataDir, tenantId, ptw.id, "applied", actor, { status: record.status, proposalId: record.id, docId: record.docId });
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
    const res = executePendingProposalWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.record.status, proposalId: res.record.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", owner);
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
export function formatCurrencyTotal(p: Pick<ProposalRecord, "lineItems" | "currency">): string {
  const cents = p.lineItems.reduce((sum, li) => sum + Math.round(Math.round(li.unitPrice * 100) * li.qty), 0);
  return `${p.currency} ${(cents / 100).toFixed(2)}`;
}

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  // Deliveries are queued SYNCHRONOUSLY (durable file write); the async flush
  // (best-effort HTTP delivery) can never drop the queued delivery.
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-proposals");
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}