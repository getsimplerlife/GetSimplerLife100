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
 *   - lifecycle draft → queued → sent|failed is fail-closed: `send` is only
 *     legal from draft|failed, `sent` is TERMINAL (no regenerate, no delete —
 *     it's a legal record), and `sent` is written ONLY after the email lane
 *     acknowledged the message (see delivery.ts) — never on a blind flip,
 *   - DURABLE INTENT: the PDF is rendered/stored and the record is written to
 *     `queued` BEFORE the outbound email attempt; the terminal status is
 *     written AFTER it, with the provider's answer stored on the record,
 *   - the customer recipient (customerEmail) is validated BEFORE the gate:
 *     malformed → 400, foreign/unknown invoice → 404, and an invoice with no
 *     recipient can never be "sent" to a guessed address,
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
  generateInvoiceShareSlug,
  nextInvoiceNumber,
  registerInvoiceSlug,
  unregisterInvoiceSlug,
} from "./store";
import { renderInvoicePdf, storeInvoicePdf, lineTotalCents, invoiceTotalCents } from "./generate";
import { validateInvoiceMutation, createInvoiceMutationFromInput, isInvoiceId, validateCustomerEmail } from "./validate";
import { deliverInvoiceEmail, invoiceShareUrl } from "./delivery";
import {
  INVOICE_DUE_DAYS,
  MAX_PENDING_INVOICE_WRITES,
  type InvoiceDeliveryAttempt,
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

/**
 * Status transition allowed from a given current status (fail-closed).
 * `send` targets "queued" — the pre-dispatch state written BEFORE the email
 * attempt; the terminal "sent"/"failed" is written only after the lane answers.
 */
function statusFor(op: InvoiceOp, current: InvoiceStatus): InvoiceStatus | null {
  switch (op) {
    case "create":
      return "draft";
    case "generate":
      // Only drafts / failed (not-sent) invoices can (re)generate a PDF.
      return current === "draft" || current === "failed" ? current : null;
    case "send":
      // draft → send, or retry a failed delivery. `sent` is terminal.
      return current === "draft" || current === "failed" ? "queued" : null;
    case "delete":
      return null; // removal handled separately (not-sent only, exact-id)
    default:
      return null;
  }
}

/**
 * Validate the write intent BEFORE the gate — throws on invalid (→ 400/404).
 * For create: the linked deal room must exist in-tenant and not be archived,
 * and its linked proposal must exist with ≥1 line item (the snapshot source).
 * For send: the customer recipient must be present AND valid, or the write
 * never reaches the queue (no invoice is ever mailed to a guessed address).
 */
function validateWrite(
  dataDir: string,
  tenantId: string,
  op: InvoiceOp,
  req: InvoiceWriteRequest,
): {
  mutation: InvoiceMutation;
  nextStatus: InvoiceStatus;
  snapshot?: { proposalId: string; currency: string; lineItems: InvoiceRecord["lineItems"]; customerEmail: string };
} {
  if (op === "create") {
    const data = req.data ?? {};
    const v = validateInvoiceMutation(data, { requireDealRoom: true });
    if (!v.ok) throw new Error(v.error);
    const dealRoomId = v.data?.linkedDealRoomId;
    if (!dealRoomId) throw new Error("linkedDealRoomId is required");
    const dealRoom = getDealRoom(dataDir, tenantId, dealRoomId);
    if (!dealRoom) throw new Error("unknown linkedDealRoomId (invoice must belong to a real deal room)");
    if (dealRoom.status === "archived") throw new Error("cannot invoice an archived deal room");
    // Recipient: an explicit (validated) address wins; otherwise snapshot the
    // deal room's own customerEmail. Never invented, never defaulted.
    const explicitEmail = v.data?.customerEmail;
    const recipient = (explicitEmail ?? (dealRoom.customerEmail || "")).trim();
    if (recipient.length > 0) {
      const ev = validateCustomerEmail(recipient);
      if (!ev.ok) throw new Error(ev.error);
    }
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
      mutation: { linkedDealRoomId: dealRoomId, ...(explicitEmail ? { customerEmail: explicitEmail } : {}) },
      nextStatus: "draft" as const,
      snapshot: { proposalId: proposal.id, currency: proposal.currency, lineItems, customerEmail: recipient },
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
  if (op === "send") {
    const mutation: InvoiceMutation = {};
    let recipient = (inv.customerEmail || "").trim();
    // An explicit recipient on the send request is validated BEFORE the gate
    // and carried with the pending write (revalidated again on apply).
    if (req.data?.customerEmail !== undefined) {
      const ev = validateCustomerEmail(req.data.customerEmail);
      if (!ev.ok) throw new Error(ev.error);
      recipient = req.data.customerEmail.trim();
      mutation.customerEmail = recipient;
    }
    if (!recipient) throw new Error("customerEmail is required to send an invoice (add the customer's email address)");
    const ev = validateCustomerEmail(recipient);
    if (!ev.ok) throw new Error(ev.error);
    return { mutation, nextStatus };
  }
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
  snapshot?: { proposalId: string; currency: string; lineItems: InvoiceRecord["lineItems"]; customerEmail: string },
): InvoiceRecord {
  if (op === "create") {
    const now = new Date().toISOString();
    const lineItems = snapshot?.lineItems ?? [];
    const due = new Date(now);
    due.setUTCDate(due.getUTCDate() + INVOICE_DUE_DAYS);
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
      customerEmail: snapshot?.customerEmail ?? "",
      dueDate: due.toISOString().slice(0, 10),
      shareSlug: null,
      lastAttempt: null,
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    insertInvoice(dataDir, record);
    appendAudit(dataDir, { tenantId, actor, action: "native.invoice.create", invoiceId: record.id, detail: `Created invoice ${record.invoiceNumber} for deal room ${record.linkedDealRoomId} (${snapshot?.proposalId ?? "?"}) — ${record.currency} ${(record.amountDueCents / 100).toFixed(2)}, due ${record.dueDate}${record.customerEmail ? `, bill to ${record.customerEmail}` : " (no customer email on file)"}` });
    publishEvent(dataDir, tenantId, "native.invoice.created", { invoiceId: record.id, invoiceNumber: record.invoiceNumber, linkedDealRoomId: record.linkedDealRoomId, currency: record.currency, amountDueCents: record.amountDueCents, status: record.status });
    return record;
  }
  if (op === "delete") {
    const inv = getInvoice(dataDir, tenantId, req.invoiceId!)!;
    appendAudit(dataDir, { tenantId, actor, action: "native.invoice.delete", invoiceId: inv.id, detail: `Deleted ${inv.status} invoice ${inv.invoiceNumber} (deal room ${inv.linkedDealRoomId})` });
    removeInvoice(dataDir, tenantId, inv.id);
    // A never-sent invoice may still carry a slug from a failed attempt —
    // retire exactly that one entry (never a sweep).
    if (inv.shareSlug) unregisterInvoiceSlug(dataDir, inv.shareSlug);
    publishEvent(dataDir, tenantId, "native.invoice.deleted", { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, linkedDealRoomId: inv.linkedDealRoomId });
    return { ...inv, status: "deleted" } as unknown as InvoiceRecord;
  }
  // generate — PDF first, THEN the durable docId write (2.2 discipline).
  const inv = getInvoice(dataDir, tenantId, req.invoiceId!)!;
  const dealRoom = getDealRoom(dataDir, tenantId, inv.linkedDealRoomId);
  const billTo = { name: dealRoom?.customerName || "Customer" };
  const docId = persistPdf(dataDir, tenantId, inv, actor, billTo);
  const record = applyInvoiceMutation(dataDir, tenantId, inv.id, { docId }, actor)!;
  appendAudit(dataDir, { tenantId, actor, action: "native.invoice.generate", invoiceId: record.id, detail: `Generated invoice ${record.invoiceNumber} PDF (${record.status}) — ${record.docId ?? "?"}` });
  publishEvent(dataDir, tenantId, "native.invoice.generated", { invoiceId: record.id, invoiceNumber: record.invoiceNumber, docId: record.docId ?? null });
  return record;
}

/**
 * The SEND path (async — the email attempt is the side effect).
 *
 * Order is deliberate and non-negotiable:
 *   1. render + store the PDF (nothing is claimed yet),
 *   2. mint/keep the public slug and write status "queued" + docId + recipient
 *      (DURABLE INTENT — if the process dies here, the record says queued,
 *      never sent),
 *   3. dispatch the email through the existing lane,
 *   4. write the TERMINAL status from the lane's own answer: "sent" ONLY on a
 *      provider acknowledgement, otherwise "failed" with the reason stored.
 * Every step appends its immutable audit line + typed native.invoice.* event.
 */
async function applySend(
  dataDir: string,
  tenantId: string,
  req: InvoiceWriteRequest,
  mutation: InvoiceMutation,
  actor: string,
): Promise<InvoiceRecord> {
  const inv = getInvoice(dataDir, tenantId, req.invoiceId!)!;
  const dealRoom = getDealRoom(dataDir, tenantId, inv.linkedDealRoomId);
  const billTo = { name: dealRoom?.customerName || "Customer" };
  // 1. PDF stored BEFORE any outbound claim (2.2 discipline).
  const docId = persistPdf(dataDir, tenantId, inv, actor, billTo);
  // 2. Public slug (minted once; reused on retry) + durable intent.
  const shareSlug = inv.shareSlug ?? generateInvoiceShareSlug();
  if (!inv.shareSlug) registerInvoiceSlug(dataDir, shareSlug, tenantId);
  let record = applyInvoiceMutation(
    dataDir,
    tenantId,
    inv.id,
    { docId, shareSlug, status: "queued", ...(mutation.customerEmail ? { customerEmail: mutation.customerEmail } : {}) },
    actor,
  )!;
  appendAudit(dataDir, { tenantId, actor, action: "native.invoice.queued", invoiceId: record.id, detail: `Queued invoice ${record.invoiceNumber} (${record.currency} ${(record.amountDueCents / 100).toFixed(2)}) for delivery to ${record.customerEmail} — PDF ${docId}` });
  publishEvent(dataDir, tenantId, "native.invoice.queued", { invoiceId: record.id, invoiceNumber: record.invoiceNumber, linkedDealRoomId: record.linkedDealRoomId, currency: record.currency, amountDueCents: record.amountDueCents, to: record.customerEmail, docId });
  // 3. The actual outbound attempt (never throws; returns an explicit outcome).
  const result = await deliverInvoiceEmail({
    invoice: record,
    customerName: billTo.name,
    issuerName: tenantId,
    shareUrl: invoiceShareUrl(shareSlug),
  });
  // 4. Terminal status from the lane's own answer.
  const attempt: InvoiceDeliveryAttempt = {
    at: new Date().toISOString(),
    by: actor,
    channel: result.channel,
    outcome: result.outcome,
    ...(result.messageId ? { messageId: result.messageId } : {}),
    ...(result.error ? { error: result.error } : {}),
  };
  const finalStatus: InvoiceStatus = result.outcome === "sent" ? "sent" : "failed";
  record = applyInvoiceMutation(dataDir, tenantId, record.id, { status: finalStatus, lastAttempt: attempt }, actor)!;
  if (finalStatus === "sent") {
    appendAudit(dataDir, { tenantId, actor, action: "native.invoice.sent", invoiceId: record.id, detail: `Sent invoice ${record.invoiceNumber} to ${record.customerEmail} via ${attempt.channel} (provider ack ${attempt.messageId ?? "?"}) — PDF ${record.docId ?? "?"}` });
    publishEvent(dataDir, tenantId, "native.invoice.sent", { invoiceId: record.id, invoiceNumber: record.invoiceNumber, linkedDealRoomId: record.linkedDealRoomId, currency: record.currency, amountDueCents: record.amountDueCents, docId: record.docId ?? null, to: record.customerEmail, channel: attempt.channel, messageId: attempt.messageId ?? null });
  } else {
    appendAudit(dataDir, { tenantId, actor, action: "native.invoice.failed", invoiceId: record.id, detail: `Invoice ${record.invoiceNumber} was NOT delivered (${attempt.outcome} via ${attempt.channel}): ${attempt.error ?? "unknown error"} — status failed, nothing is claimed as sent` });
    publishEvent(dataDir, tenantId, "native.invoice.failed", { invoiceId: record.id, invoiceNumber: record.invoiceNumber, linkedDealRoomId: record.linkedDealRoomId, currency: record.currency, amountDueCents: record.amountDueCents, to: record.customerEmail, channel: attempt.channel, outcome: attempt.outcome, error: attempt.error ?? null });
  }
  return record;
}

/** Dispatch a validated op to its apply path (send is the async one). */
async function applyValidated(
  dataDir: string,
  tenantId: string,
  op: InvoiceOp,
  req: InvoiceWriteRequest,
  mutation: InvoiceMutation,
  actor: string,
  snapshot?: { proposalId: string; currency: string; lineItems: InvoiceRecord["lineItems"]; customerEmail: string },
): Promise<InvoiceRecord> {
  if (op === "send") return applySend(dataDir, tenantId, req, mutation, actor);
  return applyMutation(dataDir, tenantId, op, req, mutation, actor, snapshot);
}

/**
 * Submit an invoice write. Validation FIRST — invalid writes 400/404 and never
 * reach the queue. Then the gate: allow-listed autonomy applies immediately;
 * otherwise a durable pending-write mirror + approval card are created.
 */
export async function submitInvoiceWrite(
  dataDir: string,
  tenantId: string,
  op: InvoiceOp,
  req: InvoiceWriteRequest,
  actor: string,
): Promise<InvoiceWriteResult> {
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
      const invoice = await applyValidated(dataDir, tenantId, op, req, validated.mutation, actor, validated.snapshot);
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
export async function executePendingInvoiceWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): Promise<{ ok: true; record: InvoiceRecord; ptwId: string; op: InvoiceOp; alreadyApplied?: boolean } | { ok: false; reason: string }> {
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
    const record = await applyValidated(dataDir, tenantId, ptw.op, { invoiceId: ptw.invoiceId ?? undefined, data: ptw.payload.data, via: ptw.payload.via }, validated.mutation, actor, validated.snapshot);
    markPendingWrite(dataDir, tenantId, ptw.id, "applied", actor, { status: record.status, invoiceId: record.id });
    return { ok: true, record, ptwId: ptw.id, op: ptw.op };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
}

/** Record the owner decision + transition the shared approval card too. */
export async function noteOwnerDecision(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  decision: "approved" | "rejected",
  owner: string,
): Promise<void> {
  const ptw = listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = await executePendingInvoiceWrite(dataDir, tenantId, approvalActionId, owner);
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