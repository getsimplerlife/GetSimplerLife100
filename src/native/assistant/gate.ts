/**
 * native/assistant/gate.ts — the ASSISTANT ask path (Phase 3.8 core).
 *
 * Every ask is a WRITE (it produces a durable conversation record) and rides
 * the EXISTING Approval Queue gate, exactly like every other native slice:
 *
 *   submitAssistantAsk(...)
 *     1. validate the prompt + caps (fail-closed BEFORE the gate — bad
 *        prompts / forged ids / cap breaches are rejected and NEVER queued);
 *     2. append a durable `native.assistant.ask.requested` audit entry (this
 *        IS the daily-cap ledger — fail-closed, never bypassed);
 *     3. build a SAFE bounded context from the tenant's own native records
 *        and (when LLM intelligence is enabled + configured) generate a
 *        DRAFT answer — the model never sees raw row content and never
 *        writes tenant data; a disabled/not-configured/failed draft becomes
 *        an honest note, never a fabricated answer;
 *     4. approvalGate(tenantId, "assistantAsk", "native-assistant", ...)
 *        - allow-listed autonomy (#236)  -> transcript applied now + audit +
 *                                          recordAutonomyOutcome;
 *        - otherwise                    -> durable pending-write mirror
 *                                          (+ the draft snapshot); apply
 *                                          happens ONLY through
 *                                          executePendingAssistantWrite (the
 *                                          approve-path executor, idempotent);
 *     5. gate/store error               -> write BLOCKED (fail-closed), never
 *                                          applied without authority.
 */
import { approvalGate, markApproved, markRejected, type ApprovalGateOutcome } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { createCostTracker } from "../../lib/llm/modelClient";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  ASSISTANT_PROVIDER,
  ASSISTANT_WORKFLOW_ID,
  ASSISTANT_LLM_CALLS_PER_DAY,
  MAX_PROMPT_CHARS,
  MAX_ASSISTANT_MESSAGES_PER_TENANT,
  MAX_PENDING_ASSISTANT_WRITES,
  MAX_ASSISTANT_DAILY_ASKS,
} from "./types";
import type { AssistantMessage, PendingAssistantWrite } from "./types";
import {
  appendAudit,
  appendMessage,
  generateAssistantEntityId,
  getPendingWrite,
  markPendingWrite,
  savePendingWrite,
  countTodayAsks,
  listMessages,
  listPendingWrites,
} from "./store";
import { buildTenantContext, serializeContext } from "./context";
import { generateAssistantDraft, type AssistantDraftDeps } from "./llm";

export interface AssistantAskRequest {
  prompt: string;
}
export type AssistantAskResult =
  | { applied: true; pending: false; approvalActionId?: string; autonomy: boolean; actionId?: string; draft: DraftSummary }
  | { applied: false; pending: true; approvalActionId: string; op: "ask"; draft: DraftSummary }
  | { applied: false; pending: false; error: string };

export interface DraftSummary {
  /** The generated draft answer (only ever a labeled model draft). */
  content?: string;
  /** Honest note when no draft exists (disabled/not-configured/cap/failure). */
  note?: string;
  provider?: string;
  model?: string;
}

function validatePrompt(dataDir: string, tenantId: string, raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) throw new Error("prompt is required");
  const prompt = raw.trim();
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`prompt exceeds ${MAX_PROMPT_CHARS} characters`);
  if (countTodayAsks(dataDir, tenantId) >= MAX_ASSISTANT_DAILY_ASKS) {
    throw new Error(`daily ask cap (${MAX_ASSISTANT_DAILY_ASKS}) reached`);
  }
  if (listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending").length >= MAX_PENDING_ASSISTANT_WRITES) {
    throw new Error(`pending write cap (${MAX_PENDING_ASSISTANT_WRITES}) reached`);
  }
  if (listMessages(dataDir, tenantId).length >= MAX_ASSISTANT_MESSAGES_PER_TENANT) {
    throw new Error(`message store cap (${MAX_ASSISTANT_MESSAGES_PER_TENANT}) reached`);
  }
  return prompt;
}

function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, ASSISTANT_PROVIDER);
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}

export async function submitAssistantAsk(
  dataDir: string,
  tenantId: string,
  actor: string,
  rawPrompt: unknown,
  deps?: AssistantDraftDeps,
): Promise<AssistantAskResult> {
  // 1. Fail-closed validation BEFORE the gate (invalid asks never queue).
  const prompt = validatePrompt(dataDir, tenantId, rawPrompt);

  // 2. Durable daily-cap ledger entry (immutable).
  appendAudit(dataDir, tenantId, actor, "native.assistant.ask.requested", `promptLen=${prompt.length}`);

  // 3. Safe context + draft (label only; never a tenant-data write).
  const contextText = serializeContext(buildTenantContext(dataDir, tenantId));
  let draft: DraftSummary = {};
  const cost = createCostTracker(dataDir);
  const can = await Promise.resolve(cost.canSpend(tenantId, { perDayCalls: ASSISTANT_LLM_CALLS_PER_DAY }));
  if (!can.ok) {
    draft = { note: `Assistant draft cap reached: ${can.reason}` };
  } else {
    const out = await generateAssistantDraft(prompt, contextText, deps);
    if (out.ok && out.content) {
      draft = { content: out.content, provider: out.provider, model: out.model };
      try {
        cost.record(tenantId, { provider: out.provider ?? "", model: out.model ?? "", tier: "fast", tokens: 0, calls: 1 });
      } catch { /* cost is best-effort; the draft itself is already produced */ }
    } else {
      draft = { note: out.note ?? "No draft was produced." };
    }
  }

  // 4. Gate: verb-first write through the Approval Queue.
  const outcome: ApprovalGateOutcome = approvalGate(
    tenantId,
    "askAssistant",
    ASSISTANT_PROVIDER,
    { prompt, contextChars: contextText.length, draftChars: draft.content?.length ?? 0, draftNote: draft.note ?? null },
    { agentId: ASSISTANT_WORKFLOW_ID, dataDir },
  );
  if (outcome.error) {
    return { applied: false, pending: false, error: outcome.error };
  }
  if (outcome.allowed) {
    const userMsg: AssistantMessage = {
      id: generateAssistantEntityId("asm"),
      tenantId,
      role: "user",
      content: prompt,
      draft: false,
      status: "applied",
      createdAt: new Date().toISOString(),
      createdBy: actor,
    };
    appendMessage(dataDir, userMsg);
    if (draft.content) {
      appendMessage(dataDir, {
        id: generateAssistantEntityId("asm"),
        tenantId,
        role: "assistant",
        content: draft.content,
        draft: true,
        status: "applied",
        createdAt: new Date().toISOString(),
        createdBy: "native-assistant",
        generatedBy: draft.provider && draft.model ? { provider: draft.provider, model: draft.model } : undefined,
      } satisfies AssistantMessage);
    }
    appendAudit(dataDir, tenantId, actor, "native.assistant.ask.applied", `promptLen=${prompt.length} draft=${draft.content ? "yes" : "none"}`);
    publishEvent(dataDir, tenantId, "native.assistant.ask.applied", { promptLen: prompt.length, draft: draft.content ? "yes" : "none" });
    if (outcome.autonomy) {
      recordAutonomyOutcome(tenantId, ASSISTANT_WORKFLOW_ID, "askAssistant", ASSISTANT_PROVIDER, true, {
        dataDir,
        allowListId: outcome.allowListId,
        target: `prompt ${prompt.length} chars`,
      });
    }
    return {
      applied: true,
      pending: false,
      approvalActionId: outcome.actionId,
      autonomy: !!outcome.autonomy,
      actionId: outcome.allowListId,
      draft,
    };
  }

  // 5. Pending: durable mirror + audited card (+ the draft snapshot).
  const apw: PendingAssistantWrite = {
    id: generateAssistantEntityId("apw"),
    tenantId,
    approvalActionId: outcome.actionId!,
    prompt,
    draftAnswer: draft.content ?? null,
    draftNote: draft.note ?? null,
    status: "pending",
    createdAt: new Date().toISOString(),
    createdBy: actor,
  };
  savePendingWrite(dataDir, apw);
  appendAudit(dataDir, tenantId, actor, "native.assistant.ask.pending", `apw=${apw.id} draft=${draft.content ? "yes" : "none"}`);
  publishEvent(dataDir, tenantId, "native.assistant.ask.pending", { apwId: apw.id, promptLen: prompt.length, draft: draft.content ? "yes" : "none" });
  return { applied: false, pending: true, approvalActionId: outcome.actionId!, op: "ask", draft };
}

/** APPROVE-path executor — idempotent; applies the stored ask transcript. */
export async function executePendingAssistantWrite(
  dataDir: string,
  tenantId: string,
  apwId: string,
  actor: string,
): Promise<{ ok: true; already?: boolean } | { ok: false; reason: string }> {
  const w = getPendingWrite(dataDir, tenantId, apwId);
  if (!w) return { ok: false, reason: "pending write not found" }; // unknown/foreign → 404-no-IDOR
  if (w.status !== "pending") return { ok: true, already: true };   // double-decide no-op
  appendMessage(dataDir, {
    id: generateAssistantEntityId("asm"),
    tenantId,
    role: "user",
    content: w.prompt,
    draft: false,
    approvalActionId: w.approvalActionId,
    status: "applied",
    createdAt: new Date().toISOString(),
    createdBy: w.createdBy,
  });
  if (w.draftAnswer) {
    appendMessage(dataDir, {
      id: generateAssistantEntityId("asm"),
      tenantId,
      role: "assistant",
      content: w.draftAnswer,
      draft: true,
      approvalActionId: w.approvalActionId,
      status: "applied",
      createdAt: new Date().toISOString(),
      createdBy: "native-assistant",
    });
  }
  markPendingWrite(dataDir, tenantId, apwId, "applied", actor);
  markApproved(tenantId, w.approvalActionId, actor, { result: { apwId, applied: true } }, dataDir);
  appendAudit(dataDir, tenantId, actor, "native.assistant.ask.applied", `apw=${w.id} draft=${w.draftAnswer ? "yes" : "none"}`);
  publishEvent(dataDir, tenantId, "native.assistant.ask.applied", { apwId: w.id, draft: w.draftAnswer ? "yes" : "none" });
  return { ok: true };
}

/** REJECT-path — the ask card is discarded; nothing is written to the transcript. */
export async function rejectAssistantWrite(
  dataDir: string,
  tenantId: string,
  apwId: string,
  actor: string,
): Promise<{ ok: true; already?: boolean } | { ok: false; reason: string }> {
  const w = getPendingWrite(dataDir, tenantId, apwId);
  if (!w) return { ok: false, reason: "pending write not found" };
  if (w.status !== "pending") return { ok: true, already: true };
  markPendingWrite(dataDir, tenantId, apwId, "rejected", actor);
  markRejected(tenantId, w.approvalActionId, actor, dataDir);
  appendAudit(dataDir, tenantId, actor, "native.assistant.ask.rejected", `apw=${w.id}`);
  return { ok: true };
}