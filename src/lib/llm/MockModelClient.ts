// src/lib/llm/MockModelClient.ts — test double for the reasoning stage.
// Scripted complete() responses so the stage's code paths and contracts are
// tested 100% without real keys or cost. Never used in production paths.
import type { ModelClient, LlmCompleteRequest, LlmCompleteResult, LlmTier } from "./modelClient";

export interface MockScript {
  content?: string;
  toolCalls?: LlmCompleteResult extends never ? never : any[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** Force a notConfigured/error result. */
  result?: "ok" | "notConfigured" | "error";
  /** Refuse on nth call to test cap/decline paths. */
  failOnCall?: number;
}

export class MockModelClient implements ModelClient {
  readonly provider = "mock";
  readonly model = "mock-model";
  readonly tier: LlmTier;
  private script: MockScript;
  callCount = 0;

  constructor(script: MockScript = {}, tier: LlmTier = "fast") {
    this.script = script;
    this.tier = tier;
  }

  async complete(req: LlmCompleteRequest): Promise<LlmCompleteResult> {
    this.callCount += 1;
    const s = this.script;
    if (s.failOnCall && this.callCount >= s.failOnCall) {
      return { kind: "error", provider: "mock", message: "mock forced error" };
    }
    if (s.result === "notConfigured") return { kind: "notConfigured", reason: "disabled" };
    if (s.result === "error") return { kind: "error", provider: "mock", message: "mock error" };
    return {
      kind: "ok",
      content: s.content ?? "",
      toolCalls: s.toolCalls ?? [],
      usage: s.usage ?? { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      provider: "mock",
      model: "mock-model",
    };
  }
}