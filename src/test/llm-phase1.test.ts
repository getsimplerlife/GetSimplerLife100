// src/test/llm-phase1.test.ts — Phase 1 of the owner-ratified LLM
// Intelligence Architecture. Mock-driven, canonical suite must stay green
// with reasoning OFF (default). Tests the modelClient contract, the
// reasoning stage's caps/tracker/tool-filter/memory-isolation, and the
// hard rule that proposed writes only ever become approval-gated actions.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
// The engine's connection lookup is DB-backed. Stub it (no connections exist),
// matching the orchestrator test — the approval GATE runs BEFORE connection
// lookup, so gating is fully exercised without a DB or provider creds.
vi.mock("../integrations/framework/connection", () => ({
  listConnectionsByProvider: vi.fn(async () => []),
  updateConnectionConfig: vi.fn(async () => {}),
}));
import {
  resolveLlmConfig,
  createModelClient,
  createCostTracker,
  DEFAULT_LLM_CONFIG,
  type LlmConfig,
} from "../lib/llm/modelClient";
import {
  runReasoningStage,
  parseProposedActions,
  buildReasoningPrompt,
  DEFAULT_ALLOWED_WRITE_VERBS,
} from "../lib/llm/reasoningStage";
import { MockModelClient } from "../lib/llm/MockModelClient";
import { enqueueApproval, listPendingActions, approvalGate } from "../lib/approval-queue";
import type { ActionItem, ProcessedData, Insight, Alert } from "../lib/agent-processor";

function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "llm-phase1-"));
  return d;
}

const BASE_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  LLM_INTELLIGENCE_ENABLED: "false", // canonical default (OFF)
  LLM_PROVIDER: "",
  LLM_BASE_URL: "",
  LLM_API_KEY: "",
  LLM_FAST_MODEL: "",
  LLM_STRONG_MODEL: "",
  LLM_MAX_TOKENS_PER_RUN: "8000",
  LLM_MAX_CALLS_PER_DAY: "100",
};

function processed(): ProcessedData {
  return { filtered: [{ id: "r1", amount: 100 }], enriched: [], matched: [], metrics: { total: 100 } };
}

function reasoningInput(overrides: Partial<Parameters<typeof runReasoningStage>[0]> = {}) {
  return {
    tenantEmail: "a@test.com",
    agentId: "agent-1",
    employee: { reasoningEnabled: false, allowedWriteVerbs: [] },
    processed: processed(),
    insights: [] as Insight[],
    alerts: [] as Alert[],
    actions: [] as ActionItem[],
    ...overrides,
  } as Parameters<typeof runReasoningStage>[0];
}

describe("LLM Phase 1 — modelClient contract", () => {
  it("resolveLlmConfig defaults to disabled (OFF by default)", () => {
    const cfg = resolveLlmConfig(BASE_ENV);
    expect(cfg.enabled).toBe(false);
    expect(cfg.provider).toBe("");
    expect(DEFAULT_LLM_CONFIG.enabled).toBe(false);
  });

  it("disabled client never calls — returns notConfigured", async () => {
    const client = createModelClient(resolveLlmConfig(BASE_ENV));
    const res = await client.complete({ messages: [{ role: "user", content: "hi" }] });
    expect(res.kind).toBe("notConfigured");
    expect(res.kind === "notConfigured" && res.reason).toBe("disabled");
  });

  it("enabled but missing baseUrl/key returns notConfigured (never guesses)", async () => {
    const cfg: LlmConfig = { ...resolveLlmConfig(BASE_ENV), enabled: true, provider: "openai", baseUrl: "", apiKey: "" };
    const client = createModelClient(cfg);
    const res = await client.complete({ messages: [{ role: "user", content: "x" }] });
    expect(res.kind === "notConfigured").toBe(true);
  });

  it("enabled + baseUrl + key issues a real HTTP call and maps the response", async () => {
    const calls: any[] = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "hello", tool_calls: [] } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const cfg: LlmConfig = {
      enabled: true,
      provider: "ollama",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "ollama",
      fastModel: "qwen2.5:3b",
      strongModel: "",
      maxTokensPerRun: 8000,
    };
    const client = createModelClient(cfg, "fast");
    const res = await client.complete({ messages: [{ role: "user", content: "hi" }], tools: [{ name: "propose_write" }], toolChoice: "none" });
    expect(res.kind).toBe("ok");
    if (res.kind === "ok") {
      expect(res.content).toBe("hello");
      expect(res.usage.totalTokens).toBe(15);
      expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
      expect(calls[0].body.model).toBe("qwen2.5:3b");
      expect(calls[0].body.tools[0].function.name).toBe("propose_write");
      expect(calls[0].body.tool_choice).toBe("none");
    }
    vi.restoreAllMocks();
  });
});

describe("LLM Phase 1 — cost tracker (caps, fail-closed)", () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("records per-tenant token/call usage and resets on a new day", () => {
    const t = createCostTracker(dir);
    const rec = t.record("a@test.com", { provider: "mock", model: "m", tier: "fast", tokens: 150, calls: 1 });
    expect(rec.tokens).toBe(150);
    expect(rec.calls).toBe(1);
    const rec2 = t.record("a@test.com", { provider: "mock", model: "m", tier: "fast", tokens: 50, calls: 1 });
    expect(rec2.tokens).toBe(200);
    const other = t.read("b@test.com");
    expect(other).toBeNull(); // zero cross-tenant leakage
  });

  it("canSpend fail-closes on per-run token budget", () => {
    const t = createCostTracker(dir);
    t.record("a@test.com", { provider: "mock", model: "m", tier: "fast", tokens: 8000, calls: 1 });
    const r = t.canSpend("a@test.com", { perRunTokens: 8000, tokensThisRun: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("per-run token budget");
  });

  it("canSpend fail-closes on daily call cap", () => {
    const t = createCostTracker(dir);
    for (let i = 0; i < 100; i++) t.record("a@test.com", { provider: "mock", model: "m", tier: "fast", tokens: 1, calls: 1 });
    const r = t.canSpend("a@test.com", { perDayCalls: 100 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("daily call cap");
  });

  it("canSpend fail-closes when tracker unavailable (bad dir)", () => {
    const t = createCostTracker(join(dir, "no-such-dir", "x"));
    const r = t.canSpend("a@test.com", {});
    expect(r.ok).toBe(false);
  });
});

describe("LLM Phase 1 — reasoning stage OFF by default", () => {
  it("declines when env disabled — deterministic flow untouched", async () => {
    const out = await runReasoningStage(reasoningInput({ employee: { reasoningEnabled: true, allowedWriteVerbs: [] } }));
    expect(out.status).toBe("declined_off");
    expect(out.plannedActions).toEqual([]);
  });

  it("declines when employee opt-in is OFF even if env enabled", async () => {
    const old = process.env.LLM_INTELLIGENCE_ENABLED;
    process.env.LLM_INTELLIGENCE_ENABLED = "true";
    try {
      const out = await runReasoningStage(reasoningInput({ employee: { reasoningEnabled: false, allowedWriteVerbs: [] } }));
      expect(out.status).toBe("declined_employee_optout");
      expect(out.plannedActions).toEqual([]);
    } finally {
      process.env.LLM_INTELLIGENCE_ENABLED = old;
    }
  });

  it("declines when unconfigured (no baseUrl) with a notConfigured client", async () => {
    const old = process.env.LLM_INTELLIGENCE_ENABLED;
    process.env.LLM_INTELLIGENCE_ENABLED = "true";
    const oldBase = process.env.LLM_BASE_URL;
    const oldKey = process.env.LLM_API_KEY;
    process.env.LLM_BASE_URL = "";
    process.env.LLM_API_KEY = "";
    try {
      const out = await runReasoningStage(reasoningInput({ employee: { reasoningEnabled: true, allowedWriteVerbs: [] } }));
      expect(out.status).toBe("declined_unconfigured");
    } finally {
      process.env.LLM_INTELLIGENCE_ENABLED = old;
      process.env.LLM_BASE_URL = oldBase;
      process.env.LLM_API_KEY = oldKey;
    }
  });
});

describe("LLM Phase 1 — reasoning stage with MockModelClient", () => {
  let dir: string;
  beforeEach(() => {
    dir = tmpDir();
    const old = process.env.LLM_INTELLIGENCE_ENABLED;
    process.env.LLM_INTELLIGENCE_ENABLED = "true";
    process.env.LLM_BASE_URL = "http://localhost:11434/v1";
    process.env.LLM_API_KEY = "ollama";
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env.LLM_INTELLIGENCE_ENABLED = "false";
    process.env.LLM_BASE_URL = "";
    process.env.LLM_API_KEY = "";
  });

  it("runs with a mock and returns proposed actions in the allowed list", async () => {
    const mock = new MockModelClient({
      content: `Plan: check overdue invoices.\n{"action":"createXeroInvoice","provider":"xero","payload":{"amount":100},"why":"draft write"}`,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });
    const out = await runReasoningStage(
      reasoningInput({ tenantEmail: "a@test.com", dataDir: dir, employee: { reasoningEnabled: true, allowedWriteVerbs: ["createXeroInvoice"] } }),
      { client: mock, tracker: createCostTracker(dir) },
    );
    expect(out.status).toBe("ran");
    expect(out.plannedActions.length).toBe(1);
    expect(out.plannedActions[0].action).toBe("createXeroInvoice");
    expect(out.proposedBy).toContain("llm:mock");
    expect(mock.callCount).toBe(2); // probe + real call
  });

  it("proposed actions NEVER execute — they only become approval-gated PendingActions", async () => {
    const mock = new MockModelClient({
      content: `{"action":"createXeroInvoice","provider":"xero","payload":{"amount":100},"why":"draft"}`,
      usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
    });
    const out = await runReasoningStage(
      reasoningInput({ tenantEmail: "a@test.com", dataDir: dir, employee: { reasoningEnabled: true, allowedWriteVerbs: ["createXeroInvoice"] } }),
      { client: mock, tracker: createCostTracker(dir) },
    );
    // The stage does NOT call executeAction — only produces proposals.
    const pending = listPendingActions("a@test.com", dir);
    expect(pending).toEqual([]); // nothing enqueued by the stage itself
    expect(out.plannedActions.length).toBe(1);
    // Now run through the REAL approval gate (proposals flow there unchanged).
    for (const a of out.plannedActions) {
      enqueueApproval(
        { tenantEmail: "a@test.com", agentId: "agent-1", actionType: a.action, provider: a.provider, summary: { what: a.detail, where: a.provider, why: a.detail }, payload: a.payload || {} },
        dir,
      );
    }
    const pending2 = listPendingActions("a@test.com", dir);
    expect(pending2.length).toBe(1);
    expect(pending2[0].status).toBe("pending"); // human must approve
  });

  it("enforces the write allow-list — model cannot propose outside it", async () => {
    const mock = new MockModelClient({
      content: `{"action":"deleteAllXeroInvoices","provider":"xero","payload":{},"why":"bad"}`,
      usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
    });
    const out = await runReasoningStage(
      reasoningInput({ tenantEmail: "a@test.com", dataDir: dir, employee: { reasoningEnabled: true, allowedWriteVerbs: ["createXeroInvoice"] } }),
      { client: mock, tracker: createCostTracker(dir) },
    );
    expect(out.plannedActions).toEqual([]); // filtered out — non-destructive guard
  });

  it("declines when caps are exceeded (per-run token budget)", async () => {
    const tracker = createCostTracker(dir);
    tracker.record("a@test.com", { provider: "mock", model: "m", tier: "fast", tokens: 8000, calls: 1 });
    const mock = new MockModelClient({ content: "{}" });
    const out = await runReasoningStage(
      reasoningInput({ tenantEmail: "a@test.com", dataDir: dir, employee: { reasoningEnabled: true, allowedWriteVerbs: ["createXeroInvoice"] } }),
      { client: mock, tracker },
    );
    expect(out.status).toBe("declined_caps");
    expect(out.plannedActions).toEqual([]);
    expect(mock.callCount).toBe(1); // only the probe, no real call after decline
  });

  it("builds a per-tenant prompt without cross-tenant memory", () => {
    const richer = reasoningInput({
      tenantEmail: "a@test.com",
      insights: [{ type: "risk", severity: "high", message: "overdue" }],
      employee: { reasoningEnabled: true, allowedWriteVerbs: ["createXeroInvoice"] },
    });
    const msgs = buildReasoningPrompt(richer, {
      rules: [],
      insights: [],
      audit: [],
      recent: [],
      metrics: [],
      memorySnippet: "firm A rule: approve > $5k",
    } as any);
    const joined = msgs.map((m) => m.content).join("\n");
    expect(joined).toContain("firm A rule");
    expect(joined).toContain("a@test.com");
    expect(joined).not.toContain("b@test.com"); // no cross-tenant bleed
  });

  it("parseProposedActions only accepts allowed write verbs and valid JSON", () => {
    const allowed = ["createXeroInvoice"];
    const parsed = parseProposedActions(
      `{"action":"createXeroInvoice","provider":"xero","payload":{"x":1},"why":"ok"}\n{"action":"deleteAll","provider":"xero"}\nnot json\n{"action":"readOnlyThing"}`,
      allowed,
    );
    expect(parsed.length).toBe(1);
    expect(parsed[0].action).toBe("createXeroInvoice");
  });

  it("deletes a destructive proposal when allow-list empty (Phase 1 default)", () => {
    const parsed = parseProposedActions(`{"action":"deleteRecords","provider":"xero","payload":{},"why":"x"}`, DEFAULT_ALLOWED_WRITE_VERBS);
    expect(parsed).toEqual([]);
  });
});

describe("LLM Phase 1 — approval gate still fail-closed for LLM proposals", () => {
  it("approvalGate('on') returns a pending action, never auto-executes", () => {
    // The proposal -> approval path must be the exact unchanged gate.
    const dir = tmpDir();
    try {
      const gate = approvalGate("a@test.com", "createXeroInvoice", "xero", { amount: 100 }, { agentId: "agent-1", dataDir: dir });
      expect(gate.allowed).toBe(false); // requires human approval
      expect(gate.actionId).toBeTruthy();
      const pending = listPendingActions("a@test.com", dir);
      expect(pending.length).toBe(1);
      expect(pending[0].status).toBe("pending");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

