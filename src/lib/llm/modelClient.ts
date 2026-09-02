// src/lib/llm/modelClient.ts — SERVER-SIDE ONLY. Never import from a .tsx/.ts
// that ships to the client bundle (keys must stay out of the browser).
//
// Provider-agnostic model client (LLM Intelligence Architecture, Phase 1).
// One wire protocol: OpenAI-style `POST {base}/chat/completions`, which
// OpenAI, Claude (OpenAI-compat), Gemini, Groq, DeepSeek, OpenRouter, and a
// local Ollama-compatible server all expose behind one shape. Switching
// provider is a config change (LLM_PROVIDER / LLM_BASE_URL / LLM_API_KEY /
// LLM_FAST_MODEL / LLM_STRONG_MODEL), never a code change.
//
// Fail-closed guarantees (owner-ratified direction 09-01):
//  - If LLM_INTELLIGENCE_ENABLED !== "true"  →  notConfigured (never calls).
//  - If no base URL or no key               →  notConfigured (never guesses).
//  - If the remote errors                    →  mapped structured error, no crash.
//  - Retry-once on 429/5xx with small backoff (bounded); everything else 1 try.
//  - The caller decides what to do with refusal/error — this module never
//    auto-executes anything.
import { readJSON, writeJSON, resolveDataDir } from "../data-store";
import { join } from "path";
import { existsSync } from "fs";

// ── Types ────────────────────────────────────────────────────────────────
export type LlmRole = "system" | "user" | "assistant" | "tool";
export interface LlmMessage {
  role: LlmRole;
  content: string;
}
export interface LlmToolDef {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>; // JSON-schema-ish
}
export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
export type LlmTier = "fast" | "strong";

export interface LlmCompleteRequest {
  messages: LlmMessage[];
  tier?: LlmTier;
  maxTokens?: number;
  temperature?: number;
  tools?: LlmToolDef[];
  /** Force the model to produce a single tool call (OpenAI `tool_choice`). */
  toolChoice?: "auto" | "required" | "none";
}

export type LlmCompleteResult =
  | {
      kind: "ok";
      content: string;
      toolCalls: LlmToolCall[];
      usage: LlmUsage;
      provider: string;
      model: string;
    }
  | { kind: "notConfigured"; reason: "disabled" | "noKey" | "noBaseUrl" }
  | { kind: "error"; provider: string; status?: number; message: string };

export interface ModelClient {
  complete(req: LlmCompleteRequest): Promise<LlmCompleteResult>;
  readonly provider: string;
  readonly model: string;
  readonly tier: LlmTier;
}

// ── Env / config resolution ─────────────────────────────────────────────
export interface LlmConfig {
  enabled: boolean;
  provider: string; // "openai" | "openrouter" | "groq" | "deepseek" | "anthropic" | "ollama" | ...
  baseUrl: string;
  apiKey: string;
  fastModel: string;
  strongModel: string;
  /** Per-run token budget — the reasoning stage refuses extra calls once spent. */
  maxTokensPerRun: number;
}

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  enabled: false,
  provider: "",
  baseUrl: "",
  apiKey: "",
  fastModel: "",
  strongModel: "",
  maxTokensPerRun: 8000,
};

export function resolveLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const enabled = env.LLM_INTELLIGENCE_ENABLED === "true";
  const provider = env.LLM_PROVIDER || "";
  // Per-provider key prefixes so keys are never hard-coded. Known prefixes:
  // OPENAI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY,
  // ANTHROPIC_API_KEY, OLLAMA (any non-empty value; Ollama needs no real key).
  let apiKey = env.LLM_API_KEY || "";
  if (!apiKey && provider) {
    const prefixMap: Record<string, string> = {
      openai: env.OPENAI_API_KEY || "",
      openrouter: env.OPENROUTER_API_KEY || "",
      groq: env.GROQ_API_KEY || "",
      deepseek: env.DEEPSEEK_API_KEY || "",
      anthropic: env.ANTHROPIC_API_KEY || "",
      ollama: "ollama", // Ollama accepts any non-empty Authorization value
    };
    apiKey = prefixMap[provider] || "";
  }
  const baseUrl = env.LLM_BASE_URL || "";
  const maxTokensPerRun = Number(env.LLM_MAX_TOKENS_PER_RUN) || DEFAULT_LLM_CONFIG.maxTokensPerRun;
  return {
    enabled,
    provider,
    baseUrl,
    apiKey,
    fastModel: env.LLM_FAST_MODEL || "",
    strongModel: env.LLM_STRONG_MODEL || "",
    maxTokensPerRun,
  };
}

export function modelForTier(cfg: LlmConfig, tier: LlmTier): string {
  if (tier === "strong") return cfg.strongModel || cfg.fastModel || "";
  return cfg.fastModel || cfg.strongModel || "";
}

// ── HTTP wrapper (single fetch, no SDKs) ────────────────────────────────
const TIMEOUT_MS = 30_000;
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function postChatCompletion(
  cfg: LlmConfig,
  model: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: any } | { ok: false; status: number; text: string }> {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  const attempt = async (): Promise<{ ok: true; data: any } | { ok: false; status: number; text: string }> => {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, text };
    }
    const data = await res.json().catch(() => null);
    return { ok: true, data };
  };
  // Retry-once on 429/5xx with bounded backoff.
  let first = await attempt();
  if (!first.ok && (first.status === 429 || first.status >= 500)) {
    await sleep(500);
    const second = await attempt();
    if (second.ok) return second;
    return second;
  }
  return first;
}

// ── Client factory ──────────────────────────────────────────────────────
export function createModelClient(cfg: LlmConfig, tier: LlmTier = "fast"): ModelClient {
  const model = modelForTier(cfg, tier);
  if (!cfg.enabled) {
    // OFF by default — a no-op client that never calls out. The reasoning
    // stage checks kind==="notConfigured" and declines.
    return {
      provider: cfg.provider || "off",
      model: "",
      tier,
      async complete(): Promise<LlmCompleteResult> {
        return { kind: "notConfigured", reason: "disabled" };
      },
    };
  }
  if (!cfg.baseUrl) {
    return {
      provider: cfg.provider,
      model: "",
      tier,
      async complete(): Promise<LlmCompleteResult> {
        return { kind: "notConfigured", reason: "noBaseUrl" };
      },
    };
  }
  if (!cfg.apiKey) {
    return {
      provider: cfg.provider,
      model: "",
      tier,
      async complete(): Promise<LlmCompleteResult> {
        return { kind: "notConfigured", reason: "noKey" };
      },
    };
  }
  if (!model) {
    return {
      provider: cfg.provider,
      model: "",
      tier,
      async complete(): Promise<LlmCompleteResult> {
        return { kind: "notConfigured", reason: "noBaseUrl" };
      },
    };
  }
  return {
    provider: cfg.provider,
    model,
    tier,
    async complete(req: LlmCompleteRequest): Promise<LlmCompleteResult> {
      const body: Record<string, unknown> = {
        model,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 1024,
      };
      if (req.tools?.length) {
        body.tools = req.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters ?? { type: "object", properties: {} } },
        }));
        body.tool_choice = req.toolChoice ?? "auto";
      }
      try {
        const result = await postChatCompletion(cfg, model, body);
        if (!result.ok) {
          return { kind: "error", provider: cfg.provider, status: result.status, message: result.text.slice(0, 500) };
        }
        const choice = result.data?.choices?.[0]?.message;
        const usage: LlmUsage = {
          promptTokens: Number(result.data?.usage?.prompt_tokens) || 0,
          completionTokens: Number(result.data?.usage?.completion_tokens) || 0,
          totalTokens: Number(result.data?.usage?.total_tokens) || 0,
        };
        const toolCalls: LlmToolCall[] = (choice?.tool_calls || []).map((tc: any) => {
          let argumentsObj: Record<string, unknown> = {};
          try {
            argumentsObj = typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function?.arguments || {};
          } catch {
            argumentsObj = { _raw: tc.function?.arguments };
          }
          return { id: tc.id || "", name: tc.function?.name || "", arguments: argumentsObj };
        });
        return {
          kind: "ok",
          content: choice?.content || "",
          toolCalls,
          usage,
          provider: cfg.provider,
          model,
        };
      } catch (err: any) {
        const message = err?.name === "AbortError" ? `timeout after ${TIMEOUT_MS}ms` : String(err?.message || err);
        return { kind: "error", provider: cfg.provider, message };
      }
    },
  };
}

// ── Cost / token tracker (durable, per-tenant, fail-closed) ─────────────
export interface CostRecord {
  provider: string;
  model: string;
  tier: LlmTier;
  tokens: number;
  calls: number;
  day: string; // YYYY-MM-DD (UTC)
  updatedAt: number;
}
export interface CostTracker {
  read(tenantEmail: string): CostRecord | null;
  record(tenantEmail: string, rec: Omit<CostRecord, "day" | "updatedAt">): CostRecord;
  /** Fail-closed: true only when the tracker is readable AND under caps. */
  canSpend(tenantEmail: string, opts: { perDayCalls?: number; perRunTokens?: number; tokensThisRun?: number }): { ok: boolean; reason?: string };
}

const LLM_COST_KEY = "tenant_llm_cost.json";

function costTrackerPath(dataDir?: string): string {
  return join(resolveDataDir(dataDir, process.cwd()), LLM_COST_KEY);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createCostTracker(dataDir?: string): CostTracker {
  const path = costTrackerPath(dataDir);
  const readAll = (): Record<string, CostRecord> => {
    try {
      const d = readJSON(path);
      return d && typeof d === "object" ? (d as Record<string, CostRecord>) : {};
    } catch {
      return {}; // first read / missing file
    }
  };
  return {
    read(tenantEmail) {
      const all = readAll();
      const rec = all[tenantEmail];
      if (!rec) return null;
      if (rec.day !== todayUtc()) {
        // New day → reset counters (still return the record for reference).
        return { ...rec, tokens: 0, calls: 0, day: todayUtc() };
      }
      return rec;
    },
    record(tenantEmail, rec) {
      const all = readAll();
      const existing = all[tenantEmail];
      const today = todayUtc();
      const base = existing && existing.day === today ? existing : { tokens: 0, calls: 0, day: today };
      const next: CostRecord = {
        provider: rec.provider,
        model: rec.model,
        tier: rec.tier,
        tokens: base.tokens + rec.tokens,
        calls: base.calls + rec.calls,
        day: today,
        updatedAt: Date.now(),
      };
      all[tenantEmail] = next;
      writeJSON(path, all); // throws → propagate (fail-closed: never spend unknowingly)
      return next;
    },
    canSpend(tenantEmail, opts) {
      try {
        // Fail-closed: if the tracker's parent dir doesn't exist, the durable
        // write would fail — treat as unavailable (never spend unknown budget).
        const dir = join(path, "..");
        if (!existsSync(dir)) return { ok: false, reason: "tracker unavailable (fail-closed)" };
        const cur = this.read(tenantEmail);
        const tokens = (cur?.tokens || 0) + (opts.tokensThisRun || 0);
        const calls = cur?.calls || 0;
        const perRun = opts.perRunTokens ?? (Number(process.env.LLM_MAX_TOKENS_PER_RUN) || 8000);
        const perDay = opts.perDayCalls ?? (Number(process.env.LLM_MAX_CALLS_PER_DAY) || 100);
        if (tokens > perRun) return { ok: false, reason: `per-run token budget exceeded (${tokens} > ${perRun})` };
        if (calls >= perDay) return { ok: false, reason: `daily call cap reached (${calls} >= ${perDay})` };
        return { ok: true };
      } catch {
        return { ok: false, reason: "tracker unavailable (fail-closed)" };
      }
    },
  };
}