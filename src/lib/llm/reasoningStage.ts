// src/lib/llm/reasoningStage.ts — SERVER-SIDE ONLY.
// Optional reasoning stage between the deterministic agent-processor output
// and the approval queue (LLM Intelligence Architecture, Phase 1).
//
// Safety invariants (owner-ratified 09-01):
//  - OFF by default: requires BOTH env LLM_INTELLIGENCE_ENABLED=true AND the
//    employee's `reasoningEnabled: true` before any call.
//  - The LLM may recommend / draft — it NEVER executes a write. Every
//    proposed write produced here is emitted as an ActionItem and must flow
//    through the unchanged executeAction → approvalGate path. This stage
//    does NOT call executeAction itself.
//  - Tool-calling allow-list: `allowedWriteVerbs` restricts which write
//    actions the model may even PROPOSE (defense against drafting a
//    destructive action it has no business proposing).
//  - Caps: per-run token budget + per-day call cap via the durable tracker.
//    Fail-closed: if the tracker can't be read, the stage declines.
//  - Per-tenant context: `buildAgentContext` feeds ONLY the tenant's own
//    memory/rules/audit tail (zero cross-tenant paths). Memory snippet
//    size-capped.
//  - When off/unconfigured/failed → deterministic processor output passes
//    through untouched (no-op), preserving current behavior exactly.
import { createModelClient, resolveLlmConfig, modelForTier, DEFAULT_LLM_CONFIG, type ModelClient, type LlmCompleteResult, type LlmTier, type LlmToolDef } from "./modelClient";
import { createCostTracker, type CostTracker } from "./modelClient";
import { readFirmMemory, type AgentContext, buildAgentContext } from "../firm-memory";
import type { ActionItem, Insight, Alert, ProcessedData } from "../agent-processor";
import { join } from "path";
import { resolveDataDir } from "../data-store";
import { isWriteAction } from "../approval-queue";

// ── Types ────────────────────────────────────────────────────────────────
export interface ReasoningEmployeeConfig {
  /** Per-employee opt-in — default OFF. Both this AND env must be true. */
  reasoningEnabled: boolean;
  /** Tier for this employee's reasoning. Defaults to "fast". */
  tier?: LlmTier;
  /** Allow-list of write action names this employee's model may PROPOSE. */
  allowedWriteVerbs?: string[];
}

export interface ReasoningInput {
  tenantEmail: string;
  agentId: string;
  dataDir?: string;
  employee: ReasoningEmployeeConfig;
  processed: ProcessedData;
  insights: Insight[];
  alerts: Alert[];
  actions: ActionItem[];
  /** Firm rules already loaded via buildAgentContext (optional — stage loads
   *  its own per-tenant context if not supplied). */
  context?: AgentContext;
}

export interface ReasoningRunOutcome {
  /** EMPTY list when off/unconfigured/declined — deterministic flow unchanged. */
  plannedActions: ActionItem[];
  /** Human-readable plan (may be empty when no model ran). */
  plan: string;
  /** Detail for the portal card: which model produced the recommendation. */
  proposedBy?: string;
  /** Status for observability. */
  status: "declined_off" | "declined_employee_optout" | "declined_unconfigured" | "declined_caps" | "declined_tracker" | "ran" | "error";
  /** Model call metadata (test observability; empty when no call). */
  usage?: { provider: string; model: string; totalTokens: number };
}

export interface ReasoningDeps {
  client?: ModelClient;
  tracker?: CostTracker;
}

// ── Defaults ─────────────────────────────────────────────────────────────
export const DEFAULT_ALLOWED_WRITE_VERBS: string[] = [];

/** Cap on the memory/context snippet in tokens (size-capped, cannot blow budget). */
export const MAX_CONTEXT_SNIPPET_TOKENS = 4000;

function snippetTokens(text: string): number {
  // Rough heuristic: ~4 chars/token for structured English.
  return Math.ceil(text.length / 4);
}

function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n…[truncated]";
}

// ── Context building (per-tenant, size-capped) ───────────────────────────
export function buildReasoningPrompt(input: ReasoningInput, ctx: AgentContext): LlmMessage[] {
  const records = truncateToTokens(JSON.stringify((input.processed.filtered || []).slice(0, 40)), 1500);
  const metrics = truncateToTokens(JSON.stringify(input.processed.metrics || {}), 800);
  const insights = truncateToTokens(JSON.stringify(input.insights || []), 1200);
  const alerts = truncateToTokens(JSON.stringify(input.alerts || []), 800);
  const memory = truncateToTokens(JSON.stringify(ctx?.memorySnippet || ctx?.recent?.slice(0, 5) || []), 1000);
  const rules = truncateToTokens(JSON.stringify(ctx?.rules || []), 800);

  const system = [
    "You are the reasoning stage of an AI Operations Employee.",
    "You RECOMMEND and DRAFT — you never execute anything. Every write you propose is approval-gated and a human approves it.",
    "Ground every statement in the provided data. Never invent records, counts, or facts that are not in the context.",
    "If the data is insufficient or ambiguous, say so and propose NO action.",
    "Rules that apply to this firm: " + (rules || "(none)"),
  ].join("\n");

  const user = [
    `Firm: ${input.tenantEmail}`,
    `Agent: ${input.agentId}`,
    `Recent firm memory: ${memory || "(none)"}`,
    `Metrics: ${metrics || "{}"}`,
    `Relevant records: ${records || "[]"}`,
    `Insights: ${insights || "[]"}`,
    `Alerts: ${alerts || "[]"}`,
    "",
    "Provide: 1) a concise plan (up to 4 steps), 2) proposed write actions as structured entries",
    "with { action, provider, payload, why }. Only propose actions in your allowed write list.",
  ].join("\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

// ── Tool definitions (read tools safe; write tools → approval proposals) ─
export function toolDefsForEmployee(input: ReasoningInput): LlmToolDef[] {
  // Phase 1 keeps tool surface minimal and deterministic: a single "propose"
  // tool whose arguments carry the draft write. The allow-list is enforced
  // in parse — the model cannot propose outside its allowedWriteVerbs.
  const allowed = input.employee.allowedWriteVerbs || [];
  return [
    {
      name: "propose_write",
      description: `Propose an approval-gated write. ALLOWED verbs: ${allowed.length ? allowed.join(", ") : "(none in Phase 1)"}. Anything else is rejected.`,
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Write action name, MUST be in the allowed list." },
          provider: { type: "string" },
          payload: { type: "object" },
          why: { type: "string" },
        },
        required: ["action", "provider", "payload", "why"],
      },
    },
  ];
}

// ── Parsing model output into ActionItems (allow-list enforced) ─────────
export function parseProposedActions(content: string, allowedVerbs: string[]): ActionItem[] {
  const items: ActionItem[] = [];
  // Extract each top-level JSON object with a brace-counting scanner, so
  // nested `payload: { ... }` doesn't truncate at the first inner `}`.
  const objects = extractJsonObjects(content);
  for (const obj of objects) {
    const action = String(obj.action || "");
    if (!action) continue;
    if (!isWriteAction(action)) continue; // only write verbs may be proposed
    if (!allowedVerbs.includes(action)) continue; // allow-list enforcement
    items.push({
      provider: String(obj.provider || ""),
      providerId: "",
      action,
      status: "pending",
      detail: String(obj.why || "LLM-proposed action"),
      payload: (obj.payload && typeof obj.payload === "object" ? obj.payload : {}) as Record<string, any>,
    });
  }
  return items;
}

/** Brace-counting JSON object extractor (handles nested braces in payload). */
function extractJsonObjects(text: string): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  let i = 0;
  while (i < text.length) {
    const startBrace = text.indexOf("{", i);
    if (startBrace === -1) break;
    let depth = 0;
    let inString = false;
    let j = startBrace;
    for (; j < text.length; j++) {
      const ch = text[j];
      if (inString) {
        if (ch === "\\") j++; // skip escaped char
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) break; // balanced top-level object
      }
    }
    const candidate = text.slice(startBrace, j + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) out.push(parsed);
    } catch {
      // malformed — skip, never guess
    }
    i = j + 1;
  }
  return out;
}

// ── The stage itself ─────────────────────────────────────────────────────
export async function runReasoningStage(input: ReasoningInput, deps: ReasoningDeps = {}): Promise<ReasoningRunOutcome> {
  const outcome: ReasoningRunOutcome = { plannedActions: [], plan: "", status: "declined_off" };

  // Gate 1 — env must be enabled.
  const cfg = resolveLlmConfig();
  if (!cfg.enabled) return { ...outcome, status: "declined_off" };

  // Gate 2 — per-employee opt-in.
  if (!input.employee?.reasoningEnabled) return { ...outcome, status: "declined_employee_optout" };

  // Gate 3 — configured client (no key/baseUrl → no-call client).
  const client = deps.client || createModelClient(cfg, input.employee.tier || "fast");
  const probe: LlmCompleteResult = await client.complete({ messages: [], maxTokens: 1 });
  if (probe.kind === "notConfigured") return { ...outcome, status: "declined_unconfigured" };

  // Gate 4 — cost tracker available (fail-closed: never spend unknown budget).
  const tracker = deps.tracker || createCostTracker(input.dataDir);
  const spend = tracker.canSpend(input.tenantEmail, { tokensThisRun: cfg.maxTokensPerRun });
  if (!spend.ok) return { ...outcome, status: "declined_caps" };

  // Build per-tenant context (size-capped) — never cross-tenant.
  let ctx: AgentContext;
  try {
    ctx = input.context || buildAgentContext(input.tenantEmail, input.dataDir);
  } catch {
    return { ...outcome, status: "declined_tracker" }; // fail-closed
  }

  const messages = buildReasoningPrompt(input, ctx);
  const tools = toolDefsForEmployee(input);
  const allowed = input.employee.allowedWriteVerbs || [];

  const result = await client.complete({ messages, tier: input.employee.tier || "fast", maxTokens: cfg.maxTokensPerRun, tools, toolChoice: "none" });
  if (result.kind !== "ok") return { ...outcome, status: "error", plan: result.kind === "error" ? result.message : "" };

  const plannedActions = parseProposedActions(result.content, allowed);

  // Record spend AFTER a successful call (fail-closed: never record without a call).
  try {
    tracker.record(input.tenantEmail, {
      provider: result.provider,
      model: result.model,
      tier: input.employee.tier || "fast",
      tokens: result.usage.totalTokens,
      calls: 1,
    });
  } catch {
    // Recording failed — but the call already happened under the pre-checked
    // budget, so we surface a WARN-like status rather than executing anything.
    return { ...outcome, status: "error", plan: "tracker record failed after call" };
  }

  return {
    plannedActions,
    plan: result.content.slice(0, 2000),
    proposedBy: `llm:${result.provider}:${result.model}`,
    status: "ran",
    usage: { provider: result.provider, model: result.model, totalTokens: result.usage.totalTokens },
  };
}