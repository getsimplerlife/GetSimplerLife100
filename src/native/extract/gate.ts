/**
 * native/extract/gate.ts — GATED WRITE PATH for Phase 3.3 native extraction.
 *
 * Mirrors the Phase 2.1–3.2 gates exactly:
 *   - validation happens BEFORE the gate (unknown document / bad shape never
 *     queues),
 *   - the extraction RUN rides the Approval Queue by default via
 *     approvalGate(tenantId, "extractDocument", "native-extract", …) —
 *     `extract` is a WRITE_VERB verb ADDED in this slice (it was missing, so
 *     extractDocument would have BYPASSED the Approval Queue as a READ —
 *     the P2.5 generate / P3.1 publish·confirm·request / P3.2 reopen class),
 *   - autonomy (#236): allow-listed entries auto-run with
 *     recordAutonomyOutcome; extraction is non-destructive → eligible,
 *   - LLM caps are enforced FAIL-CLOSED at run time: createCostTracker
 *     canSpend (≤100 calls/day per tenant, ≤8000 tokens/run) BEFORE the model
 *     call, durable per-tenant cost record AFTER; a capped tenant's apply
 *     fails closed (pending card marked rejected, no model call),
 *   - the run's output is a DRAFT (5b ExtractionResult — structured JSON,
 *     confidence, quality flags; low-confidence/flagged → human-review lane);
 *     the draft is NEVER a record write. Writing to 1.4 records happens
 *     through the TABLES slice's own gated insert (createTableRow) using the
 *     row-data helper — no double-queue, no new write verb,
 *   - the durable pending-write mirror lands with each approval card and the
 *     approve-path executor applies idempotently (replay → alreadyApplied,
 *     NO second LLM call),
 *   - every apply appends an immutable native.extract.* audit entry + a typed
 *     webhook event (Phase 1.1 registry).
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { createCostTracker, type CostTracker, type ModelClient } from "../../lib/llm/modelClient";
import { runExtraction } from "../../lib/extraction/extraction-runner";
import { listExtractions } from "../../lib/extraction/extraction-store";
import { getVaultDocument } from "../../lib/vault-store";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  EXTRACT_LLM_CALLS_PER_DAY,
  EXTRACT_TIER,
  MAX_PENDING_EXTRACT_WRITES,
  type ExtractOp,
  type PendingExtractWrite,
} from "./types";
import {
  appendAudit,
  generateExtractEntityId,
  getPendingWriteByAction,
  listPendingWrites,
  markPendingWrite,
  savePendingWrite,
} from "./store";

export type ExtractWriteRequest = {
  documentId?: string; // doc_ — the vault document to understand
  via?: string;
};

export type ExtractWriteResult =
  | { applied: true; pending: false; resultId?: string; op: ExtractOp; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: ExtractOp }
  | { applied: false; pending: false; error: string };

/** ACTION NAME is verb-first AND its verb IS in WRITE_VERB (`extract` added in
 *  this slice — fail-open guard: without it extractDocument would have been
 *  classified a READ and BYPASSED the Approval Queue). */
const ACTION_NAME: Record<ExtractOp, string> = {
  extract: "extractDocument",
};

export interface ExtractRunnerDeps {
  costTracker?: CostTracker;
  /** Injectable at run time (tests use MockModelClient; prod defaults to the
   *  real provider client, fail-closed when LLM_INTELLIGENCE_ENABLED=false). */
  client?: ModelClient;
}

const isDocId = (v: unknown): v is string => typeof v === "string" && /^doc_[A-Za-z0-9_-]+$/.test(v);

function validateWrite(dataDir: string, tenantId: string, op: ExtractOp, req: ExtractWriteRequest): void {
  if (op !== "extract") throw new Error(`unknown extract op: ${op}`);
  if (!req.documentId) throw new Error("documentId is required");
  if (!isDocId(req.documentId)) throw new Error("invalid documentId");
  const doc = getVaultDocument(dataDir, tenantId, req.documentId);
  if (!doc) throw new Error("document not found"); // 404-no-IDOR shape (cross-tenant too)
}

/** Run the LLM extraction NOW (only ever called with authority: autonomy
 *  auto-apply or the approve-path executor). Fail-closed on caps, model
 *  refusal, quality gates — output is a DRAFT, never a record write. */
async function runExtractionNow(
  dataDir: string,
  tenantId: string,
  documentId: string,
  actor: string,
  deps?: ExtractRunnerDeps,
): Promise<{ ok: true; resultId: string; category: string; requiresReview: boolean } | { ok: false; reason: string; resultId?: string }> {
  const cost = deps?.costTracker ?? createCostTracker(dataDir);
  const can = cost.canSpend(tenantId, { perDayCalls: EXTRACT_LLM_CALLS_PER_DAY });
  if (!can.ok) {
    appendAudit(dataDir, { tenantId, actor: "system", action: "native.extract.capped", documentId, detail: `Extraction blocked by LLM cap: ${can.reason}` });
    return { ok: false, reason: `LLM cap: ${can.reason}` };
  }
  const out = await runExtraction({ tenantEmail: tenantId, documentId, actor, dataDir, client: deps?.client });
  if (!out.ok) {
    appendAudit(dataDir, { tenantId, actor: "system", action: "native.extract.run.failed", documentId, detail: out.detail ?? out.error, resultId: out.resultId });
    return { ok: false, reason: out.detail ?? out.error, resultId: out.resultId };
  }
  try {
    cost.record(tenantId, { provider: out.result.provider, model: out.result.model, tier: EXTRACT_TIER, tokens: 0, calls: 1 });
  } catch { /* the durable draft was still produced; cost is best-effort */ }
  return {
    ok: true,
    resultId: out.result.id,
    category: out.result.category,
    requiresReview: out.result.quality.requiresReview,
  };
}

/** Submit a gated extraction run. Validation FIRST — invalid writes 400
 *  before the queue. */
export async function submitExtractWrite(
  dataDir: string,
  tenantId: string,
  op: ExtractOp,
  req: ExtractWriteRequest,
  actor: string,
  deps?: ExtractRunnerDeps,
): Promise<ExtractWriteResult> {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  try {
    validateWrite(dataDir, tenantId, op, req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = ACTION_NAME[op];
  const gate = approvalGate(tenantId, action, "native-extract", { documentId: req.documentId, via: req.via ?? "portal" }, { dataDir, workflowId: "native-extract" });
  if (gate.allowed) {
    const run = await runExtractionNow(dataDir, tenantId, req.documentId!, actor, deps);
    if (!run.ok) return { applied: false, pending: false, error: run.reason };
    if (gate.autonomy) {
      try {
        recordAutonomyOutcome(tenantId, gate.workflowId || "native-extract", action, "native-extract", true, { dataDir, allowListId: gate.allowListId, target: req.documentId });
      } catch { /* outcome recording never blocks the already-authorized run */ }
    }
    appendAudit(dataDir, { tenantId, actor, action: "native.extract.draft.created", documentId: req.documentId, resultId: run.resultId, detail: `Extraction draft ${run.resultId} (${run.category})${run.requiresReview ? " — human review required" : ""}${gate.autonomy ? " (autonomy)" : ""}` });
    publishEvent(dataDir, tenantId, "native.extract.draft.created", { documentId: req.documentId, resultId: run.resultId, category: run.category, requiresReview: run.requiresReview, autonomy: !!gate.autonomy });
    return { applied: true, pending: false, resultId: run.resultId, op, autonomy: !!gate.autonomy, actionId: gate.actionId };
  }
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  const pending = listPendingWrites(dataDir, tenantId);
  if (pending.length >= MAX_PENDING_EXTRACT_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_EXTRACT_WRITES}) — approve or reject before running more` };
  }
  // Dedupe: one pending extract per document (no double-decide).
  const existing = pending.find((w) => w.status === "pending" && w.op === op && w.documentId === (req.documentId ?? null));
  if (existing) return { applied: false, pending: true, approvalActionId: existing.approvalActionId, op };
  const ptw: PendingExtractWrite = {
    id: generateExtractEntityId(),
    tenantId,
    documentId: req.documentId ?? null,
    op,
    payload: { via: req.via ?? "portal" },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: "native.extract.pending", documentId: req.documentId ?? "", detail: `Queued ${action} for approval (${ptw.id})` });
  publishEvent(dataDir, tenantId, "native.extract.queued", { documentId: req.documentId, ptwId: ptw.id });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Approve-path executor: runs the approved extraction once (idempotent). */
export async function executePendingExtractWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
  deps?: ExtractRunnerDeps,
): Promise<{ ok: true; resultId?: string; ptwId: string; alreadyApplied?: boolean } | { ok: false; reason: string; ptwId?: string }> {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status !== "pending" && ptw.status !== "applied") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied" && ptw.appliedResult?.resultId) {
    return { ok: true, alreadyApplied: true, resultId: ptw.appliedResult.resultId, ptwId: ptw.id };
  }
  if (!ptw.documentId) return { ok: false, reason: "pending write has no document", ptwId: ptw.id };
  // Re-validate at apply (fail-closed): document may have been removed.
  try {
    validateWrite(dataDir, tenantId, ptw.op, { documentId: ptw.documentId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg, ptwId: ptw.id };
  }
  const run = await runExtractionNow(dataDir, tenantId, ptw.documentId, actor, deps);
  if (!run.ok) {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: run.reason });
    return { ok: false, reason: run.reason, ptwId: ptw.id };
  }
  markPendingWrite(dataDir, tenantId, ptw.id, "applied", actor, { status: "applied", resultId: run.resultId, category: run.category, requiresReview: run.requiresReview });
  appendAudit(dataDir, { tenantId, actor, action: "native.extract.draft.created", documentId: ptw.documentId, resultId: run.resultId, detail: `Extraction draft ${run.resultId} (${run.category})${run.requiresReview ? " — human review required" : ""} [approved]` });
  publishEvent(dataDir, tenantId, "native.extract.draft.created", { documentId: ptw.documentId, resultId: run.resultId, category: run.category, requiresReview: run.requiresReview, actionId: approvalActionId });
  return { ok: true, resultId: run.resultId, ptwId: ptw.id };
}

/** Record the owner decision + transition the shared approval card too.
 *  Async because the LLM run itself is async — the executor completes BEFORE
 *  the approval card is marked (no fire-and-forget). */
export async function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string, deps?: ExtractRunnerDeps): Promise<void> {
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = await executePendingExtractWrite(dataDir, tenantId, approvalActionId, owner, deps);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", resultId: res.resultId } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", owner);
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

/** Human-review lane (5b precedent): reject a DRAFT — mutates only the
 *  extraction record + vault audit; never a record write → not gated. */
export { listExtractions };

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-extract");
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}