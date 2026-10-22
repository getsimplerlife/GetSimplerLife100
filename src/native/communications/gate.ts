/**
 * native/communications/gate.ts — GATED WRITE PATH for the P1-4 native
 * COMMUNICATIONS slice (portal "Communications" working Reply).
 *
 * Mirrors the 3.4–4.4 gates exactly:
 *   - validation BEFORE the gate: a reply to a FOREIGN/stranger message id,
 *     an empty/oversized body, a forged client-supplied id, or a cap breach
 *     NEVER queues (fail-closed),
 *   - the single mutation action `createReply` is verb-first — "create" is
 *     ALREADY in WRITE_VERB, so NO new verb was needed; the classification
 *     test is EXTENDED with the gated write + never-gated reads (the standing
 *     fail-open guard: a future action whose verb is not in WRITE_VERB would
 *     be classified a READ and BYPASS the Approval Queue),
 *   - replies ride the shared Approval Queue by default (approvalGate); the
 *     durable pending-write mirror lands with each approval card; the
 *     approve-path executor is idempotent (replay → alreadyApplied),
 *   - HONEST OUTCOMES: a reply is a LOG RECORD in the tenant's OWN native
 *     communications store. This slice has NO email-send path — the record
 *     and every audit line say "saved to your communications log", never
 *     "email sent" (no fabricated send claims).
 */
import { approvalGate, markApproved, markRejected, type ApprovalGateOutcome } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  MAX_MESSAGES_PER_TENANT,
  MAX_PENDING_COMMUNICATIONS_WRITES,
  MAX_REPLY_BODY,
  NATIVE_COMMUNICATIONS_PROVIDER,
  NATIVE_COMMUNICATIONS_WORKFLOW_ID,
  type CommMessage,
  type PendingCommunicationsWrite,
} from "./types";
import {
  appendAudit,
  appendMessage,
  countNativeMessages,
  generateCommunicationsId,
  getMessage,
  getPendingWriteByAction,
  listAudit,
  listMessages,
  listPendingWrites,
  markPendingWrite,
  savePendingWrite,
} from "./store";

/** Verb-first action name — "create" ∈ WRITE_VERB; classification test asserts
 *  this gated write + the never-gated reads so a future verb gap can't
 *  silently bypass the Queue. */
export const ACTION_NAME = {
  createReply: "createReply",
} as const;
export type CommunicationsOp = keyof typeof ACTION_NAME;

export type CommunicationsWriteResult =
  | { applied: true; pending: false; op: CommunicationsOp; id?: string; autonomy: boolean }
  | { applied: false; pending: true; approvalActionId: string; op: CommunicationsOp }
  | { applied: false; pending: false; error: string };

function assertReplyBody(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("body is required");
  const body = v.trim();
  if (body.length > MAX_REPLY_BODY) throw new Error(`body must be ≤${MAX_REPLY_BODY} characters`);
  return body;
}

/** Validate + normalize the createReply payload production-style. replyTo is
 *  checked against the tenant's OWN messages (native + legacy) — a foreign or
 *  unknown id never queues (no IDOR). */
function prepareCreateReply(dataDir: string, tenantId: string, payload: Record<string, unknown>): { replyTo: string; body: string; subject: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object");
  if (payload.id !== undefined) throw new Error("client-supplied reply ids are not accepted"); // forged create-id → 400
  const replyTo = typeof payload.replyTo === "string" ? payload.replyTo.trim() : "";
  if (!replyTo) throw new Error("replyTo message id is required");
  const parent = getMessage(dataDir, tenantId, replyTo);
  if (!parent) throw new Error("replyTo message not found"); // stranger/unknown → 400 (no IDOR)
  const body = assertReplyBody(payload.body);
  const subject = typeof payload.subject === "string" && payload.subject.trim() ? payload.subject.trim().slice(0, 200) : `Re: ${parent.subject || "message"}`.slice(0, 200);
  return { replyTo, body, subject };
}

/** Honest note carried by every reply audit line this slice writes. */
export const REPLY_SAVED_NOTE =
  "Reply saved to the tenant's communications log — this slice has no email-send path; no email was sent.";

/** Execute the write under authority (autonomy auto-apply or approve path). */
function applyNow(
  dataDir: string,
  tenantId: string,
  p: { replyTo: string; body: string; subject: string },
  actor: string,
  autonomy: boolean,
): { ok: true; id: string } | { ok: false; error: string } {
  const now = new Date().toISOString();
  const auditActor = autonomy ? "system/autonomy" : actor;
  const suffix = autonomy ? " (autonomy)" : "";
  if (countNativeMessages(dataDir, tenantId) >= MAX_MESSAGES_PER_TENANT) {
    return { ok: false, error: `communications log cap reached (${MAX_MESSAGES_PER_TENANT})` };
  }
  const parent = getMessage(dataDir, tenantId, p.replyTo);
  if (!parent) return { ok: false, error: "replyTo message not found" };
  try {
    const msg: CommMessage = {
      id: generateCommunicationsId("cmm"),
      tenantId,
      from: actor,
      subject: p.subject,
      body: p.body,
      preview: p.body.slice(0, 160),
      channel: "portal",
      direction: "reply",
      replyTo: p.replyTo,
      time: now,
      sentiment: "neutral",
      read: false,
      createdAt: now,
      createdBy: actor,
    };
    appendMessage(dataDir, msg);
    appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.communications.reply.applied", entityId: msg.id, detail: `${REPLY_SAVED_NOTE} "${p.subject.slice(0, 80)}"${suffix}` });
    publishEvent(dataDir, tenantId, "native.communications.reply.applied", { replyId: msg.id, replyTo: p.replyTo, subject: p.subject.slice(0, 160) });
    return { ok: true, id: msg.id };
  } catch (e) {
    const msgStr = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msgStr };
  }
}

/**
 * Submit a gated communications write. Validation FIRST — bad writes 400
 * before the queue. Returns applied / pending / error.
 */
export function submitCommunicationsWrite(
  dataDir: string,
  tenantId: string,
  op: CommunicationsOp,
  req: { payload: Record<string, unknown>; via?: string },
  actor: string,
): CommunicationsWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  if (op !== "createReply") return { applied: false, pending: false, error: "unknown communications op" };
  const payload = req.payload ?? {};
  const action = ACTION_NAME[op];

  // 1. Fail-closed validation BEFORE the gate + cap pre-checks.
  let prepared: { replyTo: string; body: string; subject: string };
  try {
    prepared = prepareCreateReply(dataDir, tenantId, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }

  // 2. Gate (verb-first — createReply starts with "create" ∈ WRITE_VERB).
  const gate: ApprovalGateOutcome = approvalGate(tenantId, action, NATIVE_COMMUNICATIONS_PROVIDER, { op, via: req.via ?? "portal", replyTo: prepared.replyTo }, { dataDir, workflowId: NATIVE_COMMUNICATIONS_WORKFLOW_ID });
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  if (gate.allowed) {
    const out = applyNow(dataDir, tenantId, prepared, actor, !!gate.autonomy);
    if (!out.ok) return { applied: false, pending: false, error: out.error };
    if (gate.autonomy) recordAutonomyOutcome(tenantId, NATIVE_COMMUNICATIONS_WORKFLOW_ID, action, NATIVE_COMMUNICATIONS_PROVIDER, true, { dataDir, allowListId: gate.allowListId, target: out.id ?? "" });
    return { applied: true, pending: false, op, id: out.id, autonomy: !!gate.autonomy };
  }

  // 3. Queue: cap the pending mirror, then persist the durable card.
  const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
  if (pending.length >= MAX_PENDING_COMMUNICATIONS_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_COMMUNICATIONS_WRITES}) — approve or reject before more` };
  }
  const cmw: PendingCommunicationsWrite = {
    id: generateCommunicationsId("cmw"),
    tenantId,
    action,
    payload: prepared as unknown as Record<string, unknown>,
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, cmw);
  appendAudit(dataDir, { tenantId, actor, action: "native.communications.reply.pending", entityId: cmw.id, detail: `Queued ${action} for approval (${cmw.id})` });
  publishEvent(dataDir, tenantId, "native.communications.reply.pending", { op, cmwId: cmw.id });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Approve-path executor: applies the approved reply once (idempotent). */
export function executePendingCommunicationsWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; id?: string; cmwId: string; alreadyApplied?: boolean } | { ok: false; reason: string; cmwId?: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const cmw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!cmw) return { ok: false, reason: "no pending write for this approval action" };
  if (cmw.status === "rejected") return { ok: false, reason: "write was rejected" };
  if (cmw.status === "applied") {
    return { ok: true, alreadyApplied: true, id: (cmw.appliedResult?.id as string) ?? undefined, cmwId: cmw.id };
  }
  // Re-validate at apply time (authority does not bypass the contract).
  let prepared: { replyTo: string; body: string; subject: string };
  try {
    prepared = prepareCreateReply(dataDir, tenantId, cmw.payload as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, cmw.id, "rejected", { error: msg });
    return { ok: false, reason: msg, cmwId: cmw.id };
  }
  const out = applyNow(dataDir, tenantId, prepared, actor, false);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, cmw.id, "rejected", { error: out.error });
    return { ok: false, reason: out.error, cmwId: cmw.id };
  }
  markPendingWrite(dataDir, tenantId, cmw.id, "applied", { appliedResult: { id: out.id } });
  return { ok: true, id: out.id, cmwId: cmw.id };
}

/** REJECT path — the card is discarded; nothing is written. */
export function rejectCommunicationsWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; already?: boolean } | { ok: false; reason: string } {
  const cmw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!cmw) return { ok: false, reason: "no pending write for this approval action" };
  if (cmw.status !== "pending") return { ok: true, already: true };
  markPendingWrite(dataDir, tenantId, cmw.id, "rejected", { error: "rejected by owner" });
  markRejected(tenantId, cmw.approvalActionId, actor, dataDir);
  appendAudit(dataDir, { tenantId, actor, action: "native.communications.reply.rejected", entityId: cmw.id, detail: `Rejected ${cmw.action} (${cmw.id})` });
  publishEvent(dataDir, tenantId, "native.communications.reply.rejected", { op: cmw.action, cmwId: cmw.id });
  return { ok: true };
}

/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const cmw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!cmw || cmw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingCommunicationsWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(
      tenantId,
      approvalActionId,
      owner,
      { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", id: res.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) },
      dataDir,
    );
  } else {
    markPendingWrite(dataDir, tenantId, cmw.id, "rejected", { error: "rejected by owner" });
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, NATIVE_COMMUNICATIONS_PROVIDER);
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}

// ── Safe GET projections ─────────────────────────────────────────────────────
export function publicMessage(m: CommMessage): CommMessage {
  return { ...m };
}

export { listMessages, getMessage, listPendingWrites, listAudit };