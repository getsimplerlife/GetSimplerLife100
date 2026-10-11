/**
 * native/assistant/types.ts — Phase 3.8 native ASSISTANT (chat/ask surface
 * over the tenant's own native data).
 *
 * Discipline mirrors 1.4/3.5/3.6/3.7 exactly:
 *   - tenant-keyed store + durable pending-write mirror + immutable
 *     native.assistant.* audit; server-assigned ids ONLY (asm_/apw_),
 *   - every user-initiated WRITE rides the Approval Queue verb-first
 *     (`assistantAsk` — the verb `ask` is ADDED to WRITE_VERB so the
 *     classification test gates it; see approval-queue.ts),
 *   - validation BEFORE the gate: bad/empty/oversized prompts, caps, and
 *     forged ids NEVER queue (fail-closed),
 *   - the assistant NEVER mutates tenant data: it answers with a DRAFT
 *     (explicitly labeled "generated draft") from a SAFE context built from
 *     the tenant's own native records — tables (1.4: names, fields, row
 *     counts), dashboards/reports (3.6: names, descriptions, widget counts),
 *     document buckets (1.2: names, doc counts) — never raw row content and
 *     never any other tenant's data,
 *   - LLM is config-only (LLM_INTELLIGENCE_ENABLED defaults off; the suite
 *     stays LLM-free): when disabled/not-configured the ask is still a
 *     truthful, durably-audited conversation record with an honest
 *     "drafts are disabled" note — never a fabricated answer,
 *   - typed events native.assistant.* via the Phase 1.1 registry; authed-only
 *     surface (401 fail-closed); NO public share lane (3.6/3.7 precedent).
 */
export const NATIVE_ASSISTANT_KEY = "assistant_messages.json";
export const NATIVE_ASSISTANT_AUDIT_KEY = "assistant_audit.json";
export const ASSISTANT_PROVIDER = "native-assistant";
export const ASSISTANT_WORKFLOW_ID = "native-assistant";

/** Caps (fail-closed; see gate.ts for enforcement order). */
export const MAX_PROMPT_CHARS = 2000;
export const MAX_ASSISTANT_MESSAGES_PER_TENANT = 600;
export const MAX_PENDING_ASSISTANT_WRITES = 50;
export const MAX_ASSISTANT_DAILY_ASKS = 100;
export const MAX_CONTEXT_ITEMS = 60;
/** Characters of context text we will hand the model (bounded prompt). */
export const MAX_CONTEXT_CHARS = 12000;
export const ASSISTANT_LLM_CALLS_PER_DAY = 100;

/** Assistant transcript message (user prompt or generated draft). */
export interface AssistantMessage {
  id: string; // asm_<random> — server-assigned
  tenantId: string;
  role: "user" | "assistant";
  content: string;
  /** True when this is a model-generated answer (never a tenant-data write). */
  draft: boolean;
  /** When the message rode the Approval Queue, the approval action id. */
  approvalActionId?: string;
  status: "pending" | "applied" | "rejected";
  createdAt: string;
  createdBy: string;
  /** Provider/model that generated a draft (set only on real LLM runs). */
  generatedBy?: { provider: string; model: string };
}

/** Durable pending-write mirror for an ask (approve → persisted, reject → dropped). */
export interface PendingAssistantWrite {
  id: string; // apw_<random> — server-assigned
  tenantId: string;
  approvalActionId: string;
  prompt: string;
  /** The generated draft snapshot (null when drafts were disabled/failed). */
  draftAnswer: string | null;
  /** Human-readable reason when no draft was produced (disabled/config/caps/error). */
  draftNote: string | null;
  status: "pending" | "applied" | "rejected";
  createdAt: string;
  createdBy: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface AssistantAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.assistant.*
  detail: string;
}

export type AssistantAskOp = "ask";