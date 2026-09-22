/**
 * native/invoice/gate.ts — GATED WRITE PATH for invoices (Phase 2.5, FINAL slice).
 *
 * Mirrors the Phase 2.1–2.4 gates exactly:
 *   - validation happens BEFORE the gate (a never-valid write never queues),
 *   - every write action rides the Approval Queue (#164) by default through
 *     approvalGate(tenantId, actionName, "native-invoices", params, …),
 *   - autonomy (#236): an explicit allow-listed entry auto-applies; globs can
 *     NEVER approve/delete (destructive ops need exact ids),
 *   - a durable pending-write mirror lands with each approval card (tenant
 *     record untouched until apply), and the approve-path executor applies
 *     idempotently (replay → alreadyApplied),
 *   - every apply appends an immutable native.invoice.* audit entry,
 *   - linkedDealRoomId is REQUIRED + must exist IN THE TENANT (fail-closed,
 *     never a foreign room); the invoice SNAPSHOTS the room's proposal line
 *     items into INTEGER CENTS at create — a client can never inject prices,
 *     and money math never touches floats after the snapshot,
 *   - lifecycle draft → sent is fail-closed: sent is TERMINAL (no regenerate,
 *     no delete — it's a legal record); generate/send only from draft,
 *   - the PDF is rendered (Phase 1.2 safe-HTML) and STORED BEFORE the status
 *     flip (the Phase 2.2 bug-fix discipline: render+store first, then flip),
 *   - posting to the customer's books (Xero/QBO) is OUT OF SCOPE — that is the
 *     existing verified external adapters' lane, never a new connection here,
 *   - ACTION NAMES ARE VERB-FIRST (createInvoice/generateInvoice/sendInvoice/
 *     deleteInvoice) so isWriteAction classifies them as writes — a verb-last
 *     name would BYPASS the gate (fail-open).
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import { getDealRoom } from "../dealroom/store";
import { getProposal } from "../proposals/store";
import {
  insertInvoice,
  getInvoice,
  applyInvoiceMutation,
  removeInvoice,
  listPendingWrites,
  savePendingWrite,
  markPendingWrite,
  appendAudit,
  generateInvoiceEntityId,
  nextInvoiceNumber,
} from "./store";
import { renderInvoicePdf, storeInvoicePdf, lineTotalCents, invoiceTotalCents } from "./generate";
import { validateInvoiceMutation, createInvoiceMutationFromInput, isInvoiceId } from "./validate";
import {
  MAX_PENDING_INVOICE_WRITES,
  type InvoiceMutation,
  type InvoiceOp,
  type InvoiceRecord,
  type InvoiceStatus,
  type PendingInvoiceWrite,
} from "./types";

export type InvoiceWriteRequest = {
  invoiceId?: string; // null for create
  data?: InvoiceMutation;
  via?: string; // "portal"
};

export type InvoiceWriteResult =
  | { applied: true; pending: false; invoice: InvoiceRecord; op: InvoiceOp; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: InvoiceOp }
  | { applied: false; pending: false; error: string };

const ACTION_NAME: Record<InvoiceOp, string> = {
  create: "createInvoice",
  generate: "generateInvoice",
  send: "sendInvoice",
  delete: "deleteInvoice",
};

/** Status transition allowed from a given current status (fail-closed). */
function statusFor(op: InvoiceOp, current: InvoiceStatus): InvoiceStatus | null {
  switch (op) {
    case "create":
      return "draft";
    case "generate":
      return current === "draft" ? "draft" : null; // only drafts can (re)generate a PDF
    case "send":
      return current === "draft" ? "sent" : null; // sent is terminal — no re-send
    case "delete":
      return null; // removal handled separately (draft-only, exact-id)
    default:
      return null;
  }
}

/**
 * Validate the write intent BEFORE the gate — throws on invalid (→ 400/404).
 * For create: the linked deal room must exist in-tenant and not be archived,
 * and its linked proposal must exist with ≥1 line item (the snapshot source).
 */
function validateWrite(
  dataDir: string,
  tenantId: string,
  op: InvoiceOp,
  req: InvoiceWriteRequest,
): { mutation: InvoiceMutation; nextStatus: InvoiceStatus; snapshot?: { proposalId: string; currency: string; lineItems: InvoiceRecord["lineItems"] } } {
  if (op === "create") {
    const data = req.data ?? {};
    const v = validateInvoiceMutation(data, { requireDealRoom: true });
    if (!v.ok) throw new Error(v.error);
    const dealRoomId = v.data?.linkedDealRoomId;
    if (!dealRoomId) throw new Error("linkedDealRoomId is required");
    const dealRoom = getDealRoom(dataDir, tenantId, dealRoomId);
    if (!dealRoom) throw new Error("unknown linkedDealRoomId (invoice must belong to a real deal room)");
    if (dealRoom.status === "archived") throw new Error("cannot invoice an archived deal room");
    // Snapshot source: the deal room's linked proposal (2.4 requires it).
    const proposal = dealRoom.linkedProposalId ? getProposal(dataDir, tenantId, dealRoom.linkedProposalId) : null;
    if (!proposal) throw new Error("linked deal room has no proposal — cannot build an invoice");
    if (proposal.lineItems.length === 0) throw new Error("linked proposal has no line items — cannot build an invoice");
    const lineItems = proposal.lineItems.map((li) => ({
      id: generateInvoiceEntityId("invli"),
      description: li.description.trim().slice(0, 400),
      qty: li.qty,
      unitPriceCents: Math.round(li.unitPrice * 100), // integer cents, no float drift
    }));
    return {
      mutation: { linkedDealRoomId: dealRoomId },
      nextStatus: "draft" as const,
      snapshot: { proposalId: proposal.id, currency: proposal.currency, lineItems },
    };
  }
  if (op === "delete") {
    if (!isInvoiceId(req.invoiceId)) throw new Error("invoice id is required");
    const inv = getInvoice(dataDir, tenantId, req.invoiceId);
    if (!inv) throw new Error("invoice not found");
    if (inv.status === "sent") throw new Error("cannot delete a sent invoice (legal record)");
    return { mutation: {}, nextStatus: inv.status };
  }
  // generate / send
  if (!isInvoiceId(req.invoiceId)) throw new Error("invoice id is required");
  const inv = getInvoice(dataDir, tenantId, req.invoiceId);
  if (!inv) throw new Error("invoice not found");
  const nextStatus = statusFor(op, inv.status);
  if (nextStatus === null) throw new Error(`cannot ${op} an invoice in status ${inv.status}`);
  return { mutation: {}, nextStatus };
}

/** Render + persist the invoice PDF (Phase 1.2 add-only doc). Throws on failure. */
function persistPdf(dataDir: string, tenantId: string, invoice: InvoiceRecord, actor: string, billTo: { name: string }): string {
  const rendered = renderInvoicePdf(invoice, billTo);
  const docId = storeInvoicePdf(dataDir, tenantId, invoice, rendered, actor, invoice.docId);
  if (!docId) throw new Error("failed to store invoice PDF");
  return docId;
}

/** Apply a validated write to the store + audit + typed event. */
function applyMutation(
  dataDir: string,
  tenantId: string,
  op: InvoiceOp,
  req: InvoiceWriteRequest,
  mutation: InvoiceMutation,
  actor: string,
  snapshot?: { proposalId: string; currency: string; lineItems: InvoiceRecord["lineItems"] },
): InvoiceRecord {
  if (op === "create") {
    const now = new Date().toISOString();
    const lineItems = snapshot?.lineItems ?? [];
    const record: InvoiceRecord = {
      id: generateInvoiceEntityId("inv"),
      tenantId,
      invoiceNumber: nextInvoiceNumber(dataDir, tenantId),
      linkedDealRoomId: mutation.linkedDealRoomId!,
      currency: snapshot?.currency ?? "USD",
      lineItems,
      amountDueCents: invoiceTotalCents({ lineItems }),
      status: "draft",
      docId: null,
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    insertInvoice(dataDir, record);
    appendAudit(dataDir, { tenantId, actor, action: "native.invoice.create", invoiceId: record.id, detail: `Created invoice ${record.invoiceNumber} for deal room ${record.linkedDealRoomId} (${snapshot?.proposalId ?? "?"}) — ${record.currency} ${(record.amountDueCents / 100).toFixed(2)}` });
    publishEvent(dataDir, tenantId, "native.invoice.created", { invoiceId: record.id, invoiceNumber: record.invoiceNumber, linkedDealRoomId: record.linkedDealRoomId, currency: record.currency, amountDueCents: record.amountDueCents, status: record.status });
    return record;
  }
  if (op === "delete") {
    const inv = getInvoice(dataDir, tenantId, req.invoiceId!)!;
    appendAudit(dataDir, { tenantId, actor, action: "native.invoice.delete", invoiceId: inv.id, detail: `Deleted draft invoice ${inv.invoiceNumber} (deal room ${inv.linkedDealRoomId})` });
    removeInvoice(dataDir, tenantId, inv.id);
    publishEvent(dataDir, tenantId, "native.invoice.deleted", { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, linkedDealRoomId: inv.linkedDealRoomId });
    return { ...inv, status: "deleted" } as unknown as InvoiceRecord;
  }
  // generate / send — PDF first, THEN the durable status/docId write (2.2 discipline).
  const inv = getInvoice(dataDir, tenantId, req.invoiceId!)!;
  const dealRoom = getDealRoom(dataDir, tenantId, inv.linkedDealRoomId);
  const billTo = { name: dealRoom?.customerName || "Customer" };
  const docId = persistPdf(dataDir, tenantId, inv, actor, billTo);
  let record = applyInvoiceMutation(dataDir, tenantId, inv.id, { docId }, actor)!;
  if (op === "send") {
    record = applyInvoiceMutation(dataDir, tenantId, inv.id, { status: "sent" }, actor)!;
    appendAudit(dataDir, { tenantId, actor, action: "native.invoice.send", invoiceId: record.id, detail: `Sent invoice ${record.invoiceNumber} (${record.currency} ${(record.amountDueCents / 100).toFixed(2)}) — PDF ${record.docId ?? "?"}` });
    publishEvent(dataDir, tenantId, "native.invoice.sent", { invoiceId: record.id, invoiceNumber: record.invoiceNumber, linkedDealRoomId: record.linkedDealRoomId, currency: record.currency, amountDueCents: record.amountDueCents, docId: record.docId ?? null });
  } else {
    appendAudit(dataDir, { tenantId, actor, action: "native.invoice.generate", invoiceId: record.id, detail: `Generated invoice ${record.invoiceNumber} PDF (draft) — ${record.docId ?? "?"}` });
    publishEvent(dataDir, tenantId, "native.invoice.generated", { invoiceId: record.id, invoiceNumber: record.invoiceNumber, docId: record.docId ?? null });
  }
  return record;
}

/**
 * Submit an invoice write. Validation FIRST — invalid writes 400/404 and never
 * reach the queue. Then the gate: allow-listed autonomy applies immediately;
 * otherwise a durable pending-write mirror + approval card are created.
 */
export function submitInvoiceWrite(
  dataDir: string,
  tenantId: string,
  op: InvoiceOp,
  req: InvoiceWriteRequest,
  actor: string,
): InvoiceWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  let validated: ReturnType<typeof validateWrite>;
  try {
    validated = validateWrite(dataDir, tenantId, op, req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = ACTION_NAME[op];
  const params: Record<string, any> = {
    invoiceId: req.invoiceId ?? "__create__",
    op,
    via: req.via ?? "portal",
  };
  const gate = approvalGate(tenantId, action, "native-invoices", params, { dataDir, workflowId: "native-invoices" });
  if (gate.allowed) {
    try {
      const invoice = applyMutation(dataDir, tenantId, op, req, validated.mutation, actor, validated.snapshot);
      if (gate.autonomy && !op.startsWith("delete")) {
        try {
          recordAutonomyOutcome(tenantId, gate.workflowId || "native-invoices", action, "native-invoices", true, { dataDir, allowListId: gate.allowListId });
        } catch { /* outcome recording never blocks the already-authorized write */ }
      }
      return { applied: true, pending: false, invoice, op, autonomy: !!gate.autonomy, actionId: gate.actionId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { applied: false, pending: false, error: msg };
    }
  }
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  const pending = listPendingWrites(dataDir, tenantId);
  if (pending.length >= MAX_PENDING_INVOICE_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_INVOICE_WRITES}) — approve or reject before writing more` };
  }
  if (op === "generate" || op === "send" || op === "delete") {
    const existing = pending.find((w) => w.status === "pending" && w.op === op && w.invoiceId === (req.invoiceId ?? null));
    if (existing) return { applied: false, pending: true, approvalActionId: existing.approvalActionId, op };
  }
  const ptw: PendingInvoiceWrite = {
    id: generateInvoiceEntityId("ipw"),
    tenantId,
    invoiceId: req.invoiceId ?? null,
    op,
    payload: { data: validated.mutation, via: req.via ?? "portal" },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: "native.invoice.pending", invoiceId: req.invoiceId ?? "", detail: `Queued ${action} for approval (${ptw.id})` });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Approve-path executor: applies the pending write the approval card authorized. */
export function executePendingInvoiceWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; record: InvoiceRecord; ptwId: string; op: InvoiceOp; alreadyApplied?: boolean } | { ok: false; reason: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const stateWrites = listPendingWrites(dataDir, tenantId);
  const ptw = stateWrites.find((w) => w.approvalActionId === approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status !== "pending" && ptw.status !== "applied") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied" && ptw.appliedResult?.invoiceId) {
    const rec = getInvoice(dataDir, tenantId, ptw.appliedResult.invoiceId);
    if (rec) return { ok: true, alreadyApplied: true, record: rec, ptwId: ptw.id, op: ptw.op };
    return { ok: false, reason: "already applied but invoice record missing" };
  }
  let validated: ReturnType<typeof validateWrite>;
  try {
    validated = validateWrite(dataDir, tenantId, ptw.op, { invoiceId: ptw.invoiceId ?? undefined, data: ptw.payload.data, via: ptw.payload.via });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
  try {
    const record = applyMutation(dataDir, tenantId, ptw.op, { invoiceId: ptw.invoiceId ?? undefined, data: ptw.payload.data, via: ptw.payload.via }, validated.mutation, actor, validated.snapshot);
    markPendingWrite(dataDir, tenantId, ptw.id, "applied", actor, { status: record.status, invoiceId: record.id });
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
    const res = executePendingInvoiceWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.record.status, invoiceId: res.record.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", owner);
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
export { createInvoiceMutationFromInput, lineTotalCents, invoiceTotalCents };

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-invoices");
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}