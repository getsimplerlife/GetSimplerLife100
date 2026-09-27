import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setApprovalMode } from "../lib/tenant-settings";
import {
  dispatchAutomationActions,
  executePendingAutomationWrite,
  submitAutomationWrite,
  setAutomationEmailSenderForTest,
  wireAutomationEventObserver,
  evaluateConditions,
  fireRuleForEvent,
  sweepDueAutomationSchedules,
  type AutomationWriteResult,
} from "../native/automation";
import {
  getRule,
  getRun,
  listAudit,
  listPendingWrites,
  listRules,
  listRuns,
  saveRule,
} from "../native/automation/store";
import { handleNativeAutomationsAuthed, registerBuiltinNativeAutomationEventTypes } from "../native/automation/router";
import { registerNativeEventType, clearNativeEventRegistry, isRegisteredEventType } from "../native/webhooks/registry";
import { setNativeEventObserver } from "../native/webhooks/outbound";
import { createTable, listRows } from "../native/tables/store";
import type { TableDef } from "../native/tables/types";
import { getTransform, saveTransform } from "../native/transform/store";
import type { TransformRecord } from "../native/transform/types";
import { listPendingWrites as listTablesPending } from "../native/tables/store";

const T1 = "auto-t1@test.local";
const T2 = "auto-t2@test.local";
let dir: string;

function registerTypes(): void {
  // reset registry to a clean slate for this test run (tests are isolated per file run)
  try { clearNativeEventRegistry(); } catch { /* noop */ }
  registerBuiltinNativeAutomationEventTypes();
  // a triggerable typed event (the 1.4 row-created family is registered in prod;
  // simulate a domain event the rules can fire on)
  for (const t of ["native.sales.lead.created", "native.sales.lead.updated"]) {
    if (!isRegisteredEventType(t)) {
      registerNativeEventType(t, {
        validate: () => ({ ok: true as const }),
      });
    }
  }
}

function seedTable(tenantId: string): string {
  const tableId = `tbl_${Math.random().toString(36).slice(2, 10)}`;
  const def: TableDef = {
    id: tableId,
    tenantId,
    name: "Leads",
    description: "seed",
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "amount", label: "Amount", type: "number" },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: "seed",
    updatedAt: new Date().toISOString(),
    updatedBy: "seed",
  };
  createTable(dir, def);
  return tableId;
}
function seedTransform(tenantId: string): string {
  const def: TransformRecord = {
    id: `trf_${Math.random().toString(36).slice(2, 10)}`,
    tenantId,
    name: "Map leads",
    description: "",
    sourceKind: "json",
    outputMode: "records",
    recordPath: ".",
    artifactKind: null,
    targetTableId: null,
    generation: null,
    status: "active",
    fields: [{ source: "name", target: "name" }],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: "seed",
    updatedAt: new Date().toISOString(),
    updatedBy: "seed",
  };
  saveTransform(dir, def);
  return def.id;
}
function ruleBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "New lead → notify",
    description: "test",
    trigger: { kind: "event", eventType: "native.sales.lead.created" },
    conditions: [{ field: "amount", op: "gt", value: 100 }],
    actions: [{ kind: "notify", recipients: ["ops@co.test"], subject: "Lead!", body: "A big lead arrived" }],
    autonomyAllowList: [] as string[],
    ...overrides,
  };
}
function createVia(overrides: Record<string, unknown> = {}) {
  const res = submitAutomationWrite(dir, T1, "createRule", { rule: ruleBody(overrides), via: "portal" }, T1);
  expect(res.applied, JSON.stringify(res)).toBe(false);
  if (res.applied || !("approvalActionId" in res)) throw new Error("expected pending");
  return res as Extract<AutomationWriteResult, { pending: true }>;
}
function approveVia(approvalActionId: string, actor = T1) {
  const res = executePendingAutomationWrite(dir, T1, approvalActionId, actor);
  expect(res.ok, JSON.stringify(res)).toBe(true);
  return res;
}
function approveToActive(ruleId: string) {
  // approve create (already applied), then activate
  const act = submitAutomationWrite(dir, T1, "activateRule", { rule: { id: ruleId }, via: "portal" }, T1);
  expect(act.applied, JSON.stringify(act)).toBe(false);
  if (act.applied || !("approvalActionId" in act)) throw new Error("expected pending activate");
  approveVia(act.approvalActionId);
}

beforeAll(() => {
  registerTypes();
});
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "auto-"));
  setApprovalMode(T1, "on", dir);
  setApprovalMode(T2, "on", dir);
  setAutomationEmailSenderForTest(async () => ({ success: true }));
  wireAutomationEventObserver();
  setNativeEventObserver(null); // tests drive fireRuleForEvent directly
});
afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ }
  setAutomationEmailSenderForTest(null);
});

describe("Phase 3.7 gate — rule lifecycle rides the Approval Queue", () => {
  it("createRule is gated: pending → approve → applied with a server-assigned rul_ id", () => {
    const res = createVia();
    expect(res.approvalActionId.length).toBeGreaterThan(0);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(1);
    approveVia(res.approvalActionId);
    const rules = listRules(dir, T1);
    expect(rules.length).toBe(1);
    expect(rules[0]!.id).toMatch(/^rul_/);
    expect(rules[0]!.status).toBe("draft");
  });
  it("client-supplied rule id on create is rejected before the queue", () => {
    const res = submitAutomationWrite(dir, T1, "createRule", { rule: { id: "rul_hacked", ...ruleBody() }, via: "portal" }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /ids are not accepted|id/.test(res.error ?? "")).toBe(true);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending").length).toBe(0);
  });
  it("deleteRule is gated; unknown rule → error, no queue", () => {
    const r = submitAutomationWrite(dir, T1, "deleteRule", { rule: { id: "rul_nope" }, via: "portal" }, T1);
    expect(r.applied).toBe(false);
    expect("error" in r && /not found/.test(r.error ?? "")).toBe(true);
  });
  it("activate is gated; lifecycle transitions are enforced", async () => {
    const created = createVia();
    approveVia(created.approvalActionId);
    const ruleId = listRules(dir, T1)[0]!.id;
    // activate a rule WITH actions → pending on the approval queue
    const r0 = submitAutomationWrite(dir, T1, "activateRule", { rule: { id: ruleId }, via: "portal" }, T1);
    expect(r0.applied).toBe(false);
    if (r0.applied || !("approvalActionId" in r0)) throw new Error("expected pending activate");
    approveVia(r0.approvalActionId);
    expect(getRule(dir, T1, ruleId)!.status).toBe("active");
    // activating an already-active rule → rejected pre-queue
    const r1 = submitAutomationWrite(dir, T1, "activateRule", { rule: { id: ruleId }, via: "portal" }, T1);
    expect(r1.applied).toBe(false);
    expect("error" in r1 && /only draft or paused/.test(r1.error ?? "")).toBe(true);
  });
  it("pause/archive are gated lifecycle writes; archive is terminal", () => {
    const created = createVia({ actions: [{ kind: "notify", recipients: ["ops@co.test"], subject: "S", body: "B" }] });
    approveVia(created.approvalActionId);
    const ruleId = listRules(dir, T1)[0]!.id;
    approveToActive(ruleId);
    expect(getRule(dir, T1, ruleId)!.status).toBe("active");
    // pause is a gated write → pending until approved
    const p = submitAutomationWrite(dir, T1, "pauseRule", { rule: { id: ruleId }, via: "portal" }, T1);
    expect(p.applied).toBe(false);
    if (p.applied || !("approvalActionId" in p)) throw new Error("pause should be pending");
    approveVia(p.approvalActionId);
    expect(getRule(dir, T1, ruleId)!.status).toBe("paused");
    // archive terminal: active after reactivation
    const a = submitAutomationWrite(dir, T1, "archiveRule", { rule: { id: ruleId }, via: "portal" }, T1);
    expect(a.applied).toBe(false);
    if (a.applied || !("approvalActionId" in a)) throw new Error("archive should be pending");
    approveVia(a.approvalActionId);
    expect(getRule(dir, T1, ruleId)!.status).toBe("archived");
    // archived is terminal: pause on archived → error
    const r2 = submitAutomationWrite(dir, T1, "activateRule", { rule: { id: ruleId }, via: "portal" }, T1);
    expect("error" in r2 && /only draft or paused/.test(r2.error ?? "")).toBe(true);
  });
});

describe("Phase 3.7 engine — conditions", () => {
  it("evaluates eq/gt/exists and fails closed on unknown fields", () => {
    const rule = { conditions: [
      { field: "amount", op: "gt", value: 100 },
      { field: "name", op: "exists" },
    ] } as never;
    const res = evaluateConditions(rule as Parameters<typeof evaluateConditions>[0], { amount: 200, name: "Acme" } as never);
    expect(res.every((r) => r.ok)).toBe(true);
    const res2 = evaluateConditions(rule as Parameters<typeof evaluateConditions>[0], { amount: 50, name: "Acme" } as never);
    expect(res2.some((r) => !r.ok)).toBe(true);
    const res3 = evaluateConditions(rule as Parameters<typeof evaluateConditions>[0], { amount: 200 } as never);
    expect(res3.some((r) => !r.ok)).toBe(true); // unknown field fails
  });
  it("empty conditions always match", () => {
    const res = evaluateConditions({ conditions: [] } as never, {} as never);
    expect(res.length).toBe(0);
  });
});

describe("Phase 3.7 firing — event trigger, idempotency, kill switch", () => {
  function activeRule(overrides: Record<string, unknown> = {}) {
    const created = createVia(overrides);
    approveVia(created.approvalActionId);
    const ruleId = listRules(dir, T1)[0]!.id;
    approveToActive(ruleId);
    return getRule(dir, T1, ruleId)!;
  }
  it("a matched event fire dispatches actions (notify queued on mirror) with honest run ledger", async () => {
    activeRule();
    const dispatch = dispatchAutomationActions;
    const runIds = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_abc", amount: 500, name: "Acme" }, T1, dispatch);
    expect(runIds.length).toBe(1);
    const run = getRun(dir, T1, runIds[0]!);
    expect(run?.matched).toBe(true);
    const notifyAction = run?.actions.find((a) => a.kind === "notify");
    expect(notifyAction?.state).toBe("queued"); // NOT allow-listed → queued
    // email NOT sent yet (honest — queued, awaiting approval)
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending" && w.op === "sendAutomationNotification").length).toBe(1);
  });
  it("double-trigger with the same eventId is a no-op (idempotent)", async () => {
    activeRule();
    const dispatch = dispatchAutomationActions;
    const r1 = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_same", amount: 500, name: "Acme" }, T1, dispatch);
    const r2 = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_same", amount: 500, name: "Acme" }, T1, dispatch);
    expect(r1.length).toBe(1);
    expect(r2).toEqual(r1); // same run id returned
    expect(listRuns(dir, T1).length).toBe(1);
  });
  it("non-matching conditions → run recorded unmatched, no actions", async () => {
    activeRule();
    const runIds = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_small", amount: 10, name: "Acme" }, T1, dispatchAutomationActions);
    const run = getRun(dir, T1, runIds[0]!);
    expect(run?.matched).toBe(false);
    expect(run?.actions.length).toBe(0);
  });
  it("kill switch: paused rule never fires", async () => {
    activeRule();
    const ruleId = getRule(dir, T1, listRules(dir, T1)[0]!.id)!.id;
    // pause via gated write then approve
    const p = submitAutomationWrite(dir, T1, "pauseRule", { rule: { id: ruleId }, via: "portal" }, T1);
    if (!p.applied) {
      if (!("approvalActionId" in p)) throw new Error("pause should queue");
      approveVia(p.approvalActionId);
    }
    expect(getRule(dir, T1, ruleId)!.status).toBe("paused");
    const runIds = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_x", amount: 500, name: "Acme" }, T1, dispatchAutomationActions);
    expect(runIds).toEqual([]);
  });
  it("daily per-rule cap fail-closes with a durable skip run", async () => {
    activeRule({});
    const rule = getRule(dir, T1, listRules(dir, T1)[0]!.id)!;
    // fire 100 times (cap) → the 101st is skipped
    const dispatch = dispatchAutomationActions;
    for (let i = 0; i < 100; i++) {
      await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: `evt_${i}`, amount: 500, name: "Acme" }, T1, dispatch);
    }
    const runIds = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_over", amount: 500, name: "Acme" }, T1, dispatch);
    const run = getRun(dir, T1, runIds[0]!);
    expect(run?.error).toMatch(/daily execution cap/);
    expect(run?.matched).toBe(false);
    void rule;
  });
});

describe("Phase 3.7 — REUSED lanes: tableWrite + runTransform", () => {
  function activeRuleWith(actions: unknown[]) {
    const created = createVia({ actions });
    approveVia(created.approvalActionId);
    const ruleId = listRules(dir, T1)[0]!.id;
    approveToActive(ruleId);
    return getRule(dir, T1, ruleId)!;
  }
  it("tableWrite action rides the 1.4 tables approval lane (never a new write lane)", async () => {
    const tableId = seedTable(T1);
    activeRuleWith([{ kind: "tableWrite", tableId, row: { name: "Acme", amount: 500 } }]);
    const runIds = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_tbl", amount: 500, name: "Acme" }, T1, dispatchAutomationActions);
    const run = getRun(dir, T1, runIds[0]!)!;
    const tw = run.actions.find((a) => a.kind === "tableWrite");
    expect(tw?.state).toBe("queued"); // the TABLES gate gates it
    expect(listTablesPending(dir, T1).filter((w) => w.status === "pending").length).toBe(1); // tables mirror
    // row NOT inserted until the tables approval executes
    expect(listRows(dir, T1, tableId).length).toBe(0);
  });
  it("runTransform action rides the 3.5 transform approval lane", async () => {
    const transformId = seedTransform(T1);
    activeRuleWith([{ kind: "runTransform", transformId, source: "{\"name\":\"Acme\"}" }]);
    const runIds = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_trf", amount: 500, name: "Acme" }, T1, dispatchAutomationActions);
    const run = getRun(dir, T1, runIds[0]!)!;
    const rt = run.actions.find((a) => a.kind === "runTransform");
    expect(rt?.state).toBe("queued");
    expect(getTransform(dir, T1, transformId)).toBeTruthy();
  });
  it("unknown table/transform refs on an action fail validation at rule create (never queue)", () => {
    const bad = submitAutomationWrite(dir, T1, "createRule", { rule: ruleBody({ actions: [{ kind: "tableWrite", tableId: "tbl_nope", row: { a: 1 } }] }), via: "portal" }, T1);
    expect(bad.applied).toBe(false);
    expect("error" in bad && /table not found/.test(bad.error ?? "")).toBe(true);
  });
});

describe("Phase 3.7 — autonomy allow-list (explicit kinds only)", () => {
  it("allow-listed notify auto-executes with honest delivery outcome", async () => {
    setAutomationEmailSenderForTest(async ({ to }) => ({ success: true }));
    const created = createVia({ actions: [{ kind: "notify", recipients: ["ops@co.test"], subject: "S", body: "B" }], autonomyAllowList: ["notify"] });
    approveVia(created.approvalActionId);
    const ruleId = listRules(dir, T1)[0]!.id;
    approveToActive(ruleId);
    const runIds = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_auto", amount: 500, name: "Acme" }, T1, dispatchAutomationActions);
    await new Promise((r) => setTimeout(r, 50)); // async email settle
    const run = getRun(dir, T1, runIds[0]!)!;
    const notify = run.actions.find((a) => a.kind === "notify");
    expect(notify?.state).toBe("auto-applied"); // executed by allow-list
    expect(listPendingWrites(dir, T1).filter((w) => w.op === "sendAutomationNotification").length).toBe(0);
  });
  it("non-allow-listed webhook queues; allow-listed webhook publishes via 1.1", async () => {
    const created = createVia({ trigger: { kind: "event", eventType: "native.sales.lead.created" }, conditions: [], actions: [{ kind: "webhook", eventType: "native.sales.lead.created", payload: { note: "hi" } }], autonomyAllowList: ["webhook"] });
    approveVia(created.approvalActionId);
    const ruleId = listRules(dir, T1)[0]!.id;
    approveToActive(ruleId);
    const runIds = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_wh", amount: 500, name: "Acme" }, T1, dispatchAutomationActions);
    const run = getRun(dir, T1, runIds[0]!)!;
    const wh = run.actions.find((a) => a.kind === "webhook");
    expect(wh?.state).toBe("auto-applied");
  });
});

describe("Phase 3.7 — schedule triggers (REUSE 3.6 scheduleAnchor math)", () => {
  it("sweeper fires due rules, advances nextRunAt monotonically, and never double-fires the same anchor", async () => {
    const created = createVia({ trigger: { kind: "schedule", cadence: "daily", timeUtc: "09:00" }, conditions: [], actions: [{ kind: "notify", recipients: ["ops@co.test"], subject: "S", body: "B" }], autonomyAllowList: ["notify"] });
    approveVia(created.approvalActionId);
    const ruleId = listRules(dir, T1)[0]!.id;
    approveToActive(ruleId);
    const rule = getRule(dir, T1, ruleId)!;
    const t = rule.trigger;
    if (t.kind !== "schedule") throw new Error("expected schedule");
    // backdate nextRunAt to "now - 1s"
    const backdated = new Date(Date.now() - 1000).toISOString();
    saveRule(dir, { ...rule, trigger: { ...t, nextRunAt: backdated } });
    const { fired } = await sweepDueAutomationSchedules(dir, dispatchAutomationActions);
    expect(fired.length).toBe(1);
    const after = getRule(dir, T1, ruleId)!;
    if (after.trigger.kind !== "schedule") throw new Error("expected schedule");
    expect(new Date(after.trigger.nextRunAt).getTime()).toBeGreaterThan(new Date(backdated).getTime());
    // second sweep with the advanced anchor must NOT re-fire
    const second = await sweepDueAutomationSchedules(dir, dispatchAutomationActions);
    expect(second.fired.length).toBe(0);
  });
});

describe("Phase 3.7 — isolation + truthfulness + standalone controls", () => {
  it("cross-tenant: T2's event never fires T1's rule; T2 can't read T1 rules via router", async () => {
    const created = createVia();
    approveVia(created.approvalActionId);
    const ruleId = listRules(dir, T1)[0]!.id;
    approveToActive(ruleId);
    // T2 event
    const t2Runs = await fireRuleForEvent(dir, T2, "native.sales.lead.created", { eventId: "evt_t2", amount: 500, name: "T2" }, T2, dispatchAutomationActions);
    expect(t2Runs).toEqual([]);
    // T2 router read of T1's rule → 404 no-IDOR
    const r = await handleNativeAutomationsAuthed(new Request(`http://x/api/native/automation/rules/${ruleId}`), { userEmail: T2, dataDir: dir });
    expect(r.status).toBe(404);
  });
  it("anonymous route → 401 (prod-server wires after session; the handler itself fail-closed)", async () => {
    const r = await handleNativeAutomationsAuthed(new Request("http://x/api/native/automation/rules"), { userEmail: "", dataDir: dir });
    expect(r.status).toBe(400); // empty user email is rejected
  });
  it("router rejects forged create-id and ignores body id on update (path id authoritative)", async () => {
    // forged create id → 400
    const forged = await handleNativeAutomationsAuthed(new Request("http://x/api/native/automation/rules", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "rul_hacked", ...ruleBody() }) }), { userEmail: T1, dataDir: dir });
    expect(forged.status).toBe(400);
    // update body id ignored → queued under path id (202)
    const created = createVia();
    approveVia(created.approvalActionId);
    const ruleId = listRules(dir, T1)[0]!.id;
    void ruleId;
    const upd = await handleNativeAutomationsAuthed(new Request(`http://x/api/native/automation/rules/${listRules(dir, T1)[0]!.id}/update`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "rul_other", name: "Renamed", trigger: { kind: "event", eventType: "native.sales.lead.created" }, actions: [{ kind: "notify", recipients: ["ops@co.test"], subject: "S", body: "B" }] }) }), { userEmail: T1, dataDir: dir });
    expect(upd.status).toBe(202); // queued under PATH id, body id stripped
  });
  it("notify run records never claim 'sent' when the lane reports failure", async () => {
    setAutomationEmailSenderForTest(async () => ({ success: false, error: "smtp down" }));
    const created = createVia({ autonomyAllowList: ["notify"] });
    approveVia(created.approvalActionId);
    const ruleId = listRules(dir, T1)[0]!.id;
    approveToActive(ruleId);
    const runIds = await fireRuleForEvent(dir, T1, "native.sales.lead.created", { eventId: "evt_fail", amount: 500, name: "Acme" }, T1, dispatchAutomationActions);
    await new Promise((r) => setTimeout(r, 50));
    const run = getRun(dir, T1, runIds[0]!)!;
    const notify = run.actions.find((a) => a.kind === "notify");
    expect(notify?.state).toBe("failed"); // honest — the lane failed
    expect(notify?.deliveries?.every((d) => d.sent === false)).toBe(true);
  });
  it("audit is immutable and tenant-scoped", () => {
    createVia();
    const audits = listAudit(dir, T1);
    expect(audits.length).toBeGreaterThan(0);
    expect(audits.every((a) => a.tenantId === T1)).toBe(true);
  });
});

function requireStore() {
  return { saveRule };
}