/**
 * native/assistant/llm.ts — assistant DRAFT generation (config-only, 09-24).
 *
 * SRVJE-side only (keys must never touch the client bundle — the whole
 * assistant slice lives under src/native/ and is only imported by the Bun
 * server). Fail-closed guarantees:
 *   - LLM_INTELLIGENCE_ENABLED !== "true"  → notEnabled (never calls)
 *   - no base URL / no key                 → notConfigured (never guesses)
 *   - remote error / refusal / caps        → mapped honest note (never a
 *                                            fabricated answer)
 * Output is ALWAYS a labeled DRAFT — the assistant never writes tenant data.
 */
import {
  createModelClient,
  resolveLlmConfig,
  type LlmMessage,
  type ModelClient,
} from "../../lib/llm/modelClient";

export interface AssistantDraftDeps {
  /** Injectable at run time (tests use a mock; prod defaults to the real
   *  config-driven client, fail-closed when disabled). */
  client?: ModelClient;
}

export interface AssistantDraftResult {
  ok: boolean;
  /** The labeled draft answer (only when a real model produced it). */
  content?: string;
  provider?: string;
  model?: string;
  /** Honest note when no draft was produced (disabled/config/cap/failure). */
  note?: string;
}

const SYSTEM_PROMPT = `You are a draft-writing assistant inside a customer's own platform.
Answer the question using ONLY the tenant context provided below.
Rules:
- Every answer you write is a DRAFT for the customer to review — start it with "Draft:".
- Base every statement on the provided tenant context. If the context does not contain the answer, say exactly: "I don't have that information in your workspace yet." and stop.
- Never invent numbers, names, or facts. Never reference data that is not in the context.
- Keep answers short and practical.`;

export async function generateAssistantDraft(
  question: string,
  contextText: string,
  deps?: AssistantDraftDeps,
): Promise<AssistantDraftResult> {
  const cfg = resolveLlmConfig();
  if (cfg.enabled !== true || cfg.provider === "" || cfg.baseUrl === "" || cfg.apiKey === "") {
    return { ok: false, note: "Assistant drafts are disabled for your workspace right now." };
  }
  const model = deps?.client ?? createModelClient(cfg, "fast");
  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `TENANT CONTEXT (your own workspace data, safe summary):\n${contextText}\n\nQUESTION:\n${question}` },
  ];
  const result = await model.complete({ messages, tier: "fast", maxTokens: 600, temperature: 0.2 });
  if (result.kind === "ok") {
    const content = (result.content ?? "").trim();
    if (!content) return { ok: false, note: "The model returned an empty draft — nothing was generated." };
    const labeled = content.startsWith("Draft:") ? content : `Draft: ${content}`;
    return { ok: true, content: labeled, provider: result.provider, model: result.model };
  }
  if (result.kind === "notConfigured") {
    return { ok: false, note: "Assistant drafts are not configured for this workspace yet." };
  }
  return { ok: false, note: "The draft generator could not produce an answer right now. No draft was created." };
}