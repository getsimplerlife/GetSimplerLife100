/**
 * native-assistant.test.ts — Phase 3.8 native ASSISTANT (chat/ask over the
 * tenant's own native data).
 *
 * LLM-FREE: drafts run on MockModelClient (injected via deps) and the
 * disabled path never touches a model — the canonical suite never calls a
 * real LLM.
 *
 * Coverage: every ask is a WRITE (assistantAsk — `ask` ADDED to WRITE_VERB,
 * the fail-open guard) that rides the Approval Queue by default; fail-closed
 * validation BEFORE the gate (empty/oversized prompt, caps — never queued);
 * server-assigned ids only (forged/unknown apw ids → 400/404-no-IDOR);
 * durable pending-write mirror + idempotent approve executor (replay →
 * no-op, no duplicate messages); disabled drafts → honest note + mock never
 * called (no fabricated answers); enabled drafts → labeled "Draft:" message
 * persisted on apply; daily ask cap fails closed; tenant isolation (a second
 * tenant can never read the first tenant's transcript); immutable
 * native.assistant.* audit; typed native.assistant.* event registration.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWriteAction } from "../lib/approval-queue";
import { MockModelClient } from "../lib/llm/MockModelClient";
import {
  handleNativeAssistantAuthed,
  registerBuiltinNativeAssistantEventTypes,
} from "../native/assistant/router";
import { submitAssistantAsk, executePendingAssistantWrite, rejectAssistantWrite } from "../native/assistant/gate";
import { appendAudit, listAudit, listMessages, listPendingWrites } from "../native/assistant/store";
import { MAX_ASSISTANT_DAILY_ASKS, MAX_PROMPT_CHARS } from "../native/assistant/types";
import { validateNativeEventType } from "../native/webhooks/registry";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-assistant-"));
  savedEnv = {
    LLM_INTELLIGENCE_ENABLED: process.env.LLM_INTELLIGENCE_ENABLED,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_FAST_MODEL: process.env.LLM_FAST_MODEL,
  };
  process.env.LLM_INTELLIGENCE_ENABLED = "";
  process.env.LLM_PROVIDER = "";
  process.env.LLM_BASE_URL = "";
  process.env.LLM_API_KEY = "";
  process.env.LLM_FAST_MODEL = "";
  registerBuiltinNativeAssistantEventTypes();
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(dir, { recursive: true, force: true });
});

function askBody(prompt: unknown): Request {
  return new Request("http://x/api/native/assistant/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
}

describe("3.8 assistant — gated ask surface", () => {
  it("assistantAsk is classified a WRITE (ask verb added to WRITE_VERB)", () => {
    expect(isWriteAction("askAssistant")).toBe(true);
    // Pure reads stay ungated.
    expect(isWriteAction("listAssistantMessages")).toBe(false);
    expect(isWriteAction("getAssistantAudit")).toBe(false);
  });

  it("rides the Approval Queue by default, with honest disabled-draft note (no LLM call)", async () => {
    const client = new MockModelClient({ content: "Draft: something" });
    const out = await submitAssistantAsk(dir, T1, T1, "Which tables do I have?", { client });
    expect(out.pending).toBe(true);
    if (!out.pending) throw new Error("expected pending");
    expect(out.approvalActionId).toMatch(/^act-|^act_/);
    // Drafts disabled → honest note, never a fabricated answer, mock untouched.
    expect(out.draft.content).toBeUndefined();
    expect(out.draft.note).toMatch(/disabled/i);
    expect(client.callCount).toBe(0);
    // Nothing persisted yet (durable mirror only).
    expect(listMessages(dir, T1).length).toBe(0);
    const writes = listPendingWrites(dir, T1);
    expect(writes.length).toBe(1);
    expect(writes[0].status).toBe("pending");
    expect(writes[0].draftAnswer).toBeNull();
    // Immutable audit shows requested + pending.
    const audit = listAudit(dir, T1);
    expect(audit.some((a) => a.action === "native.assistant.ask.requested")).toBe(true);
    expect(audit.some((a) => a.action === "native.assistant.ask.pending")).toBe(true);
  });

  it("approve-path executor persists the transcript idempotently", async () => {
    const out = await submitAssistantAsk(dir, T1, T1, "How many dashboards do I have?");
    if (!out.pending) throw new Error("expected pending");
    const writes = listPendingWrites(dir, T1);
    const apwId = writes[0].id;
    const res = await executePendingAssistantWrite(dir, T1, apwId, T1);
    expect(res).toEqual({ ok: true });
    const messages = listMessages(dir, T1);
    expect(messages.length).toBe(1); // user prompt only (drafts disabled)
    expect(messages[0].role).toBe("user");
    expect(messages[0].status).toBe("applied");
    // Idempotent replay → no-op, no duplicate.
    const again = await executePendingAssistantWrite(dir, T1, apwId, T1);
    expect(again).toEqual({ ok: true, already: true });
    expect(listMessages(dir, T1).length).toBe(1);
    expect(listPendingWrites(dir, T1)[0].status).toBe("applied");
  });

  it("enabled drafts produce a labeled draft message on apply (mock client, suite stays LLM-free)", async () => {
    process.env.LLM_INTELLIGENCE_ENABLED = "true";
    process.env.LLM_PROVIDER = "openai";
    process.env.LLM_BASE_URL = "https://api.openai.com/v1";
    process.env.LLM_API_KEY = "sk-test-not-real";
    process.env.LLM_FAST_MODEL = "gpt-test";
    const client = new MockModelClient({ content: "You have 2 dashboards and 3 data tables." });
    const out = await submitAssistantAsk(dir, T1, T1, "Summarize my dashboards.", { client });
    expect(out.pending).toBe(true);
    if (!out.pending) throw new Error("expected pending");
    expect(out.draft.content).toMatch(/^Draft:/);
    expect(client.callCount).toBe(1);
    const apwId = listPendingWrites(dir, T1)[0].id;
    await executePendingAssistantWrite(dir, T1, apwId, T1);
    const messages = listMessages(dir, T1);
    expect(messages.length).toBe(2);
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].draft).toBe(true);
    expect(messages[1].content).toMatch(/^Draft:/);
  });

  it("reject-path discards the ask (no transcript write)", async () => {
    await submitAssistantAsk(dir, T1, T1, "Discard me please.");
    const apwId = listPendingWrites(dir, T1)[0].id;
    const res = await rejectAssistantWrite(dir, T1, apwId, T1);
    expect(res).toEqual({ ok: true });
    expect(listMessages(dir, T1).length).toBe(0);
    expect(listPendingWrites(dir, T1)[0].status).toBe("rejected");
    expect(listAudit(dir, T1).some((a) => a.action === "native.assistant.ask.rejected")).toBe(true);
  });

  it("fail-closed validation BEFORE the gate: empty/oversized prompts never queue", async () => {
    await expect(submitAssistantAsk(dir, T1, T1, "")).rejects.toThrow(/required/i);
    await expect(submitAssistantAsk(dir, T1, T1, "   ")).rejects.toThrow(/required/i);
    await expect(submitAssistantAsk(dir, T1, T1, "x".repeat(MAX_PROMPT_CHARS + 1))).rejects.toThrow(/exceeds/i);
    expect(listPendingWrites(dir, T1).length).toBe(0);
    expect(listAudit(dir, T1).filter((a) => a.action === "native.assistant.ask.requested").length).toBe(0);
  });

  it("daily ask cap fails closed (durable audit ledger)", async () => {
    for (let i = 0; i < MAX_ASSISTANT_DAILY_ASKS; i++) {
      appendAudit(dir, T1, T1, "native.assistant.ask.requested", `seed ${i}`);
    }
    await expect(submitAssistantAsk(dir, T1, T1, "one more")).rejects.toThrow(/daily ask cap/i);
    expect(listPendingWrites(dir, T1).length).toBe(0);
  });

  it("tenant isolation: cross-tenant ids / transcripts never leak", async () => {
    await submitAssistantAsk(dir, T1, T1, "private to A");
    const apwId = listPendingWrites(dir, T1)[0].id;
    await executePendingAssistantWrite(dir, T1, apwId, T1);
    expect(listMessages(dir, T1).length).toBe(1);
    // Tenant B sees none of A's transcript or writes.
    expect(listMessages(dir, T2).length).toBe(0);
    expect(listPendingWrites(dir, T2).length).toBe(0);
    expect(listAudit(dir, T2).length).toBe(0);
    // B applying A's pending write id → 404-no-IDOR shape.
    const res = await executePendingAssistantWrite(dir, T2, apwId, T2);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not found/i);
  });

  it("HTTP surface: ask 200 pending / 400 validation / messages GET / 404 unknown write", async () => {
    const ok = await handleNativeAssistantAuthed(askBody("hello assistant"), { userEmail: T1, dataDir: dir });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { pending?: boolean; draft?: { note?: string } };
    expect(body.pending).toBe(true);
    if (body.draft) expect(body.draft.note).toMatch(/disabled/i);

    const bad = await handleNativeAssistantAuthed(askBody(""), { userEmail: T1, dataDir: dir });
    expect(bad.status).toBe(400);

    const msgs = await handleNativeAssistantAuthed(new Request("http://x/api/native/assistant/messages"), { userEmail: T1, dataDir: dir });
    expect(msgs.status).toBe(200);

    const applyUnknown = await handleNativeAssistantAuthed(
      new Request("http://x/api/native/assistant/writes/apw_forged/apply", { method: "POST" }),
      { userEmail: T1, dataDir: dir },
    );
    expect(applyUnknown.status).toBe(404);
    const applyMalformed = await handleNativeAssistantAuthed(
      new Request("http://x/api/native/assistant/writes/not-an-id/apply", { method: "POST" }),
      { userEmail: T1, dataDir: dir },
    );
    expect(applyMalformed.status).toBe(400);
  });

  it("typed native.assistant.* events register via the Phase 1.1 registry", () => {
    for (const t of ["native.assistant.ask.requested", "native.assistant.ask.pending", "native.assistant.ask.applied", "native.assistant.ask.rejected"]) {
      const v = validateNativeEventType(t, { eventId: "evt_test", promptLen: 4 });
      expect(v.ok).toBe(true);
    }
  });
});