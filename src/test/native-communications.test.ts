/**
 * native-communications.test.ts — P1-4 native COMMUNICATIONS slice tests
 * (portal "Communications" working Reply).
 *
 * Coverage contract (mirrors native-knowledgebase.test.ts):
 *   - write-verb classification: the single gated mutation createReply gates
 *     (verb-first; "create" ∈ WRITE_VERB — no new verb needed); every READ
 *     (listMessages/getMessage/listPendingWrites/listAudit) is never gated —
 *     the standing fail-open guard (a future action whose verb is not in
 *     WRITE_VERB would be classified a READ and BYPASS the Approval Queue),
 *   - approval-by-default (mode "on"): a reply QUEUES; the approve path
 *     persists ONE reply record; replay → alreadyApplied (idempotent),
 *   - validation BEFORE the gate: empty/oversized body, forged client id,
 *     stranger/unknown replyTo NEVER queue (fail-closed),
 *   - HONEST OUTCOMES: the persisted reply is a native LOG record
 *     (direction "reply", replyTo, from = actor) with truthfulness copy —
 *     "saved to your communications log"; NO email-send claim anywhere,
 *   - tenant isolation: reads are tenant-scoped; a stranger replying to
 *     another tenant's message id → 404 (no IDOR),
 *   - HTTP surface: 200/201/202/400/404/405 semantics,
 *   - immutable audit + typed native.communications.* event registration.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWriteAction } from "../lib/approval-queue";
import { handleNativeCommunicationsAuthed, registerBuiltinNativeCommunicationsEventTypes } from "../native/communications/router";
import { executePendingCommunicationsWrite, rejectCommunicationsWrite, submitCommunicationsWrite, REPLY_SAVED_NOTE } from "../native/communications/gate";
import { getMessage, listAudit, listMessages, listPendingWrites } from "../native/communications/store";
import { LEGACY_COMMUNICATIONS_KEY, MAX_REPLY_BODY } from "../native/communications/types";
import { validateNativeEventType } from "../native/webhooks/registry";
import { resolveDataDir } from "../lib/data-store";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-communications-"));
  registerBuiltinNativeCommunicationsEventTypes();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Seed a legacy inbound message (the shape the legacy /api/data/
 *  communications surface writes) so there is something to reply to. */
function seedLegacyMessage(tenant = T1, subject = "Hello from client", id = "msg-abc123"): void {
  const file = join(resolveDataDir(dir, process.cwd()), LEGACY_COMMUNICATIONS_KEY);
  const existing: Record<string, unknown[]> = (() => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return {}; } })();
  existing[tenant] = [
    ...(existing[tenant] ?? []),
    { id, from: "client@vendor.test", subject, preview: "Can you confirm the timeline?", channel: "email", time: "Oct 20, 10:00", sentiment: "neutral", read: false },
  ];
  writeFileSync(file, JSON.stringify(existing, null, 2));
}

/** Queue a reply and expect it PENDING (approval default ON). */
function queueReply(body: string, replyTo = "msg-abc123", tenant = T1, actor = tenant): { approvalActionId: string } {
  const res = submitCommunicationsWrite(dir, tenant, "createReply", { payload: { body, replyTo }, via: "portal" }, actor);
  expect(res.applied, JSON.stringify(res)).toBe(false);
  if (res.applied || !("approvalActionId" in res)) throw new Error("expected pending");
  return res as Extract<ReturnType<typeof submitCommunicationsWrite>, { pending: true }>;
}

/** Approve the queued reply via the approve-path executor. */
function approveReply(approvalActionId: string, tenant = T1, actor = tenant): { id?: string } {
  const res = executePendingCommunicationsWrite(dir, tenant, approvalActionId, actor);
  expect(res.ok, JSON.stringify(res)).toBe(true);
  if (!res.ok) throw new Error("expected ok, got: " + res.reason);
  return res as { ok: true; id?: string; cmwId: string; alreadyApplied?: boolean };
}

// ── 1. Write-verb classification (standing fail-open guard) ───────────────
describe("write-verb classification", () => {
  it("gates the communications reply mutation verb-first (create ∈ WRITE_VERB)", () => {
    expect(isWriteAction("createReply")).toBe(true);
  });
  it("never gates pure READ actions", () => {
    for (const name of [
      "listMessages", "getMessage", "listCommunicationsWrites", "listCommunicationsAudit",
    ]) {
      expect(isWriteAction(name), name).toBe(false);
    }
  });
});

// ── 2. Approval-by-default + reply lifecycle ───────────────────────────────
describe("reply lifecycle (approval-gated)", () => {
  it("reply queues; approve persists one reply log record in the thread", () => {
    seedLegacyMessage();
    const queued = queueReply("The timeline is confirmed. We'll share dates next week.");
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(1);
    const res = approveReply(queued.approvalActionId);
    const messages = listMessages(dir, T1);
    const reply = messages.find((m) => m.id === res.id);
    expect(reply).toBeTruthy();
    expect(reply!.direction).toBe("reply");
    expect(reply!.replyTo).toBe("msg-abc123");
    expect(reply!.from).toBe(T1);
    expect(reply!.body).toBe("The timeline is confirmed. We'll share dates next week.");
    expect(reply!.channel).toBe("portal");
    // The parent message is still visible in the same thread.
    expect(messages.some((m) => m.id === "msg-abc123" && m.direction === "inbound")).toBe(true);
    // pending mirror is now applied
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(0);
  });
  it("approve-path is idempotent: replay → alreadyApplied, no duplicate reply", () => {
    seedLegacyMessage();
    const queued = queueReply("Follow-up: timeline confirmed.");
    const first = approveReply(queued.approvalActionId);
    const replay = executePendingCommunicationsWrite(dir, T1, queued.approvalActionId, T1);
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.alreadyApplied).toBe(true);
    const replies = listMessages(dir, T1).filter((m) => m.direction === "reply");
    expect(replies).toHaveLength(1);
    expect(replies[0]!.id).toBe(first.id);
  });
  it("reject discards the card; nothing is written", () => {
    seedLegacyMessage();
    const queued = queueReply("This should not be saved.");
    const out = rejectCommunicationsWrite(dir, T1, queued.approvalActionId, T1);
    expect(out.ok).toBe(true);
    expect(listMessages(dir, T1).filter((m) => m.direction === "reply")).toHaveLength(0);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(0);
  });
});

// ── 3. Validation BEFORE the gate (fail-closed; never queued) ──────────────
describe("validation before the gate", () => {
  it("empty body → error, never queued", () => {
    seedLegacyMessage();
    const res = submitCommunicationsWrite(dir, T1, "createReply", { payload: { body: "   ", replyTo: "msg-abc123" }, via: "portal" }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /body is required/.test(res.error ?? "")).toBe(true);
    expect(listPendingWrites(dir, T1)).toHaveLength(0);
  });
  it("oversized body → error, never queued", () => {
    seedLegacyMessage();
    const res = submitCommunicationsWrite(dir, T1, "createReply", { payload: { body: "x".repeat(MAX_REPLY_BODY + 1), replyTo: "msg-abc123" }, via: "portal" }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /body must be ≤/.test(res.error ?? "")).toBe(true);
    expect(listPendingWrites(dir, T1)).toHaveLength(0);
  });
  it("forged client-supplied id → error, never queued", () => {
    seedLegacyMessage();
    const res = submitCommunicationsWrite(dir, T1, "createReply", { payload: { body: "ok", replyTo: "msg-abc123", id: "cmm_forged" }, via: "portal" }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /client-supplied/.test(res.error ?? "")).toBe(true);
    expect(listPendingWrites(dir, T1)).toHaveLength(0);
  });
  it("unknown replyTo → error, never queued", () => {
    const res = submitCommunicationsWrite(dir, T1, "createReply", { payload: { body: "ok", replyTo: "msg-does-not-exist" }, via: "portal" }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /not found/.test(res.error ?? "")).toBe(true);
    expect(listPendingWrites(dir, T1)).toHaveLength(0);
  });
  it("unknown ops fail closed", () => {
    seedLegacyMessage();
    const res = submitCommunicationsWrite(dir, T1, "notAnOp" as never, { payload: {} }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /unknown communications op/.test(res.error ?? "")).toBe(true);
  });
});

// ── 4. Honest outcomes (truthfulness copy) ─────────────────────────────────
describe("honest reply records", () => {
  it("the reply record + audit say 'saved to communications log' — no email-send claim", () => {
    seedLegacyMessage();
    const queued = queueReply("Confirmed.");
    approveReply(queued.approvalActionId);
    const audit = listAudit(dir, T1);
    const appliedAudit = audit.find((e) => e.action === "native.communications.reply.applied");
    expect(appliedAudit).toBeTruthy();
    expect(appliedAudit!.detail).toContain(REPLY_SAVED_NOTE);
    // Honest NEGATION is present; an affirmative send claim is never made
    // (no recipient, no "sent" delivery assertion).
    expect(appliedAudit!.detail).toContain("no email was sent");
    expect(appliedAudit!.detail).not.toMatch(/email was sent (to|by)/i);
    expect(appliedAudit!.detail).not.toMatch(/has been emailed/i);
    // The slice never fabricates an email-send field on the record itself.
    const reply = listMessages(dir, T1).find((m) => m.direction === "reply")!;
    expect(reply.channel).toBe("portal");
    expect(reply.from).toBe(T1);
  });
});

// ── 5. Tenant isolation ────────────────────────────────────────────────────
describe("tenant isolation", () => {
  it("reads are tenant-scoped; a stranger's message id → 404", async () => {
    seedLegacyMessage(T1);
    const t2List = await handleNativeCommunicationsAuthed(new Request("http://x/api/native/communications"), { userEmail: T2, dataDir: dir });
    expect(((await t2List.json()) as { data: { messages: unknown[] } }).data.messages).toEqual([]);
    // T2 replying to T1's message id → 404 (no IDOR)
    const t2Reply = await handleNativeCommunicationsAuthed(
      new Request("http://x/api/native/communications/messages/msg-abc123/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "hi" }) }),
      { userEmail: T2, dataDir: dir },
    );
    expect(t2Reply.status).toBe(404);
  });
});

// ── 6. HTTP surface ────────────────────────────────────────────────────────
describe("HTTP surface", () => {
  it("authed thread read returns the tenant's own data", async () => {
    seedLegacyMessage(T1);
    const res = await handleNativeCommunicationsAuthed(new Request("http://x/api/native/communications"), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { messages: unknown[] } }).data.messages).toHaveLength(1);
  });
  it("reply via HTTP returns 202 pending; malformed payloads → 400", async () => {
    seedLegacyMessage();
    const reply = await handleNativeCommunicationsAuthed(
      new Request("http://x/api/native/communications/messages/msg-abc123/reply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "HTTP reply" }) }),
      { userEmail: T1, dataDir: dir },
    );
    expect(reply.status).toBe(202);
    expect(((await reply.json()) as { data: { approvalActionId: string } }).data.approvalActionId).toBeTruthy();
    const bad = await handleNativeCommunicationsAuthed(
      new Request("http://x/api/native/communications/messages/msg-abc123/reply", { method: "POST", headers: { "content-type": "application/json" }, body: "not json" }),
      { userEmail: T1, dataDir: dir },
    );
    expect(bad.status).toBe(400);
    // apply the queued HTTP reply → 201 shape (server id + applied)
    const writes = await handleNativeCommunicationsAuthed(new Request("http://x/api/native/communications/writes"), { userEmail: T1, dataDir: dir });
    const w = ((await writes.json()) as { data: { writes: Array<{ id: string; status: string }> } }).data.writes[0]!;
    const apply = await handleNativeCommunicationsAuthed(new Request(`http://x/api/native/communications/writes/${w.id}/apply`, { method: "POST" }), { userEmail: T1, dataDir: dir });
    expect(apply.status).toBe(200);
    expect(((await apply.json()) as { data: { status: string } }).data.status).toBe("applied");
    expect(listMessages(dir, T1).filter((m) => m.direction === "reply")).toHaveLength(1);
  });
  it("unknown routes → 404; wrong method → 405 on writes", async () => {
    const nf = await handleNativeCommunicationsAuthed(new Request("http://x/api/native/communications/nope"), { userEmail: T1, dataDir: dir });
    expect(nf.status).toBe(404);
    const m405 = await handleNativeCommunicationsAuthed(new Request("http://x/api/native/communications/writes", { method: "POST" }), { userEmail: T1, dataDir: dir });
    expect(m405.status).toBe(405);
  });
  it("cross-tenant HTTP list stays tenant-scoped", async () => {
    seedLegacyMessage(T1);
    const t2 = await handleNativeCommunicationsAuthed(new Request("http://x/api/native/communications"), { userEmail: T2, dataDir: dir });
    expect(((await t2.json()) as { data: { messages: unknown[] } }).data.messages).toEqual([]);
  });
  it("getMessage resolves the parent in the thread", () => {
    seedLegacyMessage();
    expect(getMessage(dir, T1, "msg-abc123")).toBeTruthy();
    expect(getMessage(dir, T2, "msg-abc123")).toBeNull();
    expect(getMessage(dir, T1, "nope")).toBeNull();
  });
});

// ── 7. Audit + typed events ────────────────────────────────────────────────
describe("audit + typed events", () => {
  it("every mutation writes an immutable audit entry", () => {
    seedLegacyMessage();
    const queued = queueReply("Audited.");
    approveReply(queued.approvalActionId);
    const audit = listAudit(dir, T1);
    expect(audit.length).toBeGreaterThanOrEqual(2); // pending + applied
    expect(audit.every((e) => e.action.startsWith("native.communications."))).toBe(true);
    expect(audit.every((e) => e.id.startsWith("cmu_"))).toBe(true);
  });
  it("registers typed native.communications.* events", () => {
    for (const t of [
      "native.communications.reply.pending",
      "native.communications.reply.applied",
      "native.communications.reply.rejected",
    ]) {
      const v = validateNativeEventType(t, { eventId: "evt_test" });
      expect(v.ok, `${t} should validate`).toBe(true);
    }
    const bad = validateNativeEventType("native.communications.reply.applied", {});
    expect(bad.ok).toBe(false);
  });
});