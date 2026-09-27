/**
 * native/automation/engine.ts — pure evaluation + firing engine for Phase 3.7
 * native automations / workflow builder.
 *
 *   - evaluateConditions: bounded field comparisons over a flattened payload
 *     (dotted paths). Unknown/missing field → NO match (fail-closed — a rule
 *     must never fire on data it cannot see).
 *   - fireRule: single-rule dispatch, IDEMPOTENT by triggerRef (event id or
 *     schedule anchor) — double-trigger → no-op returning the existing run.
 *   - fireRuleForEvent: event-trigger entry (wired as the 1.1 outbound
 *     observer at boot — see webhooks/outbound setNativeEventObserver).
 *   - sweepDueAutomationSchedules: schedule-trigger sweeper for the
 *     prod-server interval; advances nextRunAt monotonically via the 3.6
 *     scheduleAnchor math (REUSE — scheduler durability discipline).
 *
 * Dispatch of a rule's ACTIONS lives in automation/gate (submitAutomationWrite
 * + the REUSED 1.4/3.5 gates); the engine is pure w.r.t. side effects except
 * the durable run ledger + audit it must persist. NO LLM anywhere in this slice.
 */
import { scheduleAnchor } from "../dashboard/engine";
import {
  appendAudit,
  findRunByRef,
  generateAutomationEntityId,
  listAllActiveRules,
  listRuns,
  listRules,
  saveRule,
  saveRun,
} from "./store";
import { MAX_RUNS_PER_DAY_PER_RULE, type AutomationRule, type AutomationRun, type ConditionOp, type RunActionOutcome } from "./types";

/** Flatten a payload's top-level scalar fields + one level of nested objects
 *  into dotted paths ("rowData.amount"). Arrays left as-is (stringified by
 *  string ops). Bounded: only scalar-tipped leaves are addressed. */
export function flattenPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        out[`${k}.${k2}`] = v2;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}
function lookup(path: string, flat: Record<string, unknown>): unknown {
  // exact dotted key first, then a strict top-level prefix fallback
  if (path in flat) return flat[path];
  const prefix = path.split(".")[0] ?? "";
  if (prefix in flat) return flat[prefix];
  return undefined;
}
function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null || v === undefined) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
function compare(op: ConditionOp, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = asString(actual);
      if (a === "") return false; // fail-closed: empty never compares
      const an = Number(a);
      const bn = Number(expected);
      if (Number.isFinite(an) && Number.isFinite(bn)) {
        return op === "gt" ? an > bn : op === "gte" ? an >= bn : op === "lt" ? an < bn : an <= bn;
      }
      const bs = asString(expected);
      return op === "gt" ? a > bs : op === "gte" ? a >= bs : op === "lt" ? a < bs : a <= bs;
    }
    case "contains":
      return asString(actual).includes(asString(expected));
    case "startsWith":
      return asString(actual).startsWith(asString(expected));
    case "endsWith":
      return asString(actual).endsWith(asString(expected));
    default:
      return false;
  }
}
/** Evaluate every condition against the flattened payload. Empty conditions
 *  → ALL match (rule always fires). Unknown field → that condition FAILS. */
export function evaluateConditions(
  rule: Pick<AutomationRule, "conditions">,
  payload: Record<string, unknown>,
): Array<{ field: string; op: ConditionOp; value?: unknown; ok: boolean }> {
  const flat = flattenPayload(payload);
  return (rule.conditions ?? []).map((c) => {
    const actual = lookup(c.field, flat);
    return { field: c.field, op: c.op, value: c.value, ok: compare(c.op, actual, c.value) };
  });
}
function allMatch(res: Array<{ ok: boolean }>): boolean {
  return res.every((r) => r.ok);
}
/** How many runs a rule has recorded since UTC midnight — bounds/day. */
function runsSinceUtcMidnight(dataDir: string, tenantId: string, ruleId: string, now: Date): number {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return listRuns(dataDir, tenantId, ruleId).filter((r) => {
    const t = new Date(r.triggeredAt).getTime();
    return t >= start.getTime() && t <= now.getTime();
  }).length;
}
/** Bound triggerRef (idempotency key + run ledger key). */
function filterRef(raw: string): string {
  if (raw.length <= 160) return raw;
  return raw.slice(0, 140) + "…" + hashOf(raw);
}
function hashOf(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Dispatch ONE rule for a fired trigger. Returns the run (the EXISTING one
 *  on a duplicate triggerRef — idempotent). Kill switch honored: non-active
 *  rules never fire. Daily per-rule cap fail-closes with a durable skip run. */
export async function fireRule(
  dataDir: string,
  tenantId: string,
  rule: AutomationRule,
  triggerKind: "event" | "schedule",
  triggerRef: string,
  payload: Record<string, unknown>,
  triggeredBy: string,
  now: Date = new Date(),
  dispatchActions: (dataDir: string, tenantId: string, rule: AutomationRule, payload: Record<string, unknown>, triggeredBy: string) => Promise<RunActionOutcome[]> | RunActionOutcome[],
): Promise<AutomationRun | null> {
  if (rule.status !== "active") return null; // kill switch honored
  const existing = findRunByRef(dataDir, tenantId, rule.id, triggerRef);
  if (existing) return existing; // double-trigger → no-op
  const daily = runsSinceUtcMidnight(dataDir, tenantId, rule.id, now);
  if (daily >= MAX_RUNS_PER_DAY_PER_RULE) {
    appendAudit(dataDir, { tenantId, actor: triggeredBy, action: "native.automation.run.skipped", ruleId: rule.id, detail: `Daily cap reached (${MAX_RUNS_PER_DAY_PER_RULE}) — run skipped` });
    const skipRun: AutomationRun = {
      id: generateAutomationEntityId("arn"),
      tenantId,
      ruleId: rule.id,
      ruleName: rule.name,
      triggerKind,
      triggerRef,
      triggeredBy,
      triggeredAt: now.toISOString(),
      matched: false,
      conditions: [],
      actions: [],
      error: `daily execution cap reached (${MAX_RUNS_PER_DAY_PER_RULE})`,
    };
    saveRun(dataDir, skipRun);
    return skipRun;
  }
  const conditions = evaluateConditions(rule, payload);
  const matched = allMatch(conditions);
  const actions: RunActionOutcome[] = matched ? await dispatchActions(dataDir, tenantId, rule, payload, triggeredBy) : [];
  const run: AutomationRun = {
    id: generateAutomationEntityId("arn"),
    tenantId,
    ruleId: rule.id,
    ruleName: rule.name,
    triggerKind,
    triggerRef,
    triggeredBy,
    triggeredAt: now.toISOString(),
    matched,
    conditions,
    actions,
  };
  saveRun(dataDir, run);
  appendAudit(dataDir, { tenantId, actor: triggeredBy, action: matched ? "native.automation.run.matched" : "native.automation.run.unmatched", ruleId: rule.id, runId: run.id, detail: `Rule "${rule.name}" ${matched ? "matched and dispatched" : "conditions not met"} (${triggerRef})` });
  return run;
}

/** EVENT trigger entry — scan the tenant's ACTIVE event rules and fire those
 *  whose eventType matches. Returns created run ids. */
export async function fireRuleForEvent(
  dataDir: string,
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
  actor: string,
  dispatchActions: (dataDir: string, tenantId: string, rule: AutomationRule, payload: Record<string, unknown>, triggeredBy: string) => Promise<RunActionOutcome[]> | RunActionOutcome[],
  now: Date = new Date(),
): Promise<string[]> {
  const rules = listRules(dataDir, tenantId).filter(
    (r) => r.status === "active" && r.trigger.kind === "event" && r.trigger.eventType === eventType,
  );
  const out: string[] = [];
  for (const rule of rules) {
    const eventId = typeof payload.eventId === "string" && payload.eventId ? payload.eventId : `evt:${eventType}:${JSON.stringify(payload ?? {})}`;
    const run = await fireRule(dataDir, tenantId, rule, "event", filterRef(eventId), payload ?? {}, actor, now, dispatchActions);
    if (run) out.push(run.id);
  }
  return out;
}

/** SCHEDULE trigger sweeper: fires due ACTIVE scheduled rules and advances
 *  nextRunAt monotonically (3.6 scheduleAnchor math). The anchor IS the
 *  triggerRef, so a crash-replay can never double-fire the same occurrence.
 *  Serialised by the caller (prod-server interval). */
export async function sweepDueAutomationSchedules(
  dataDir: string,
  dispatchActions: (dataDir: string, tenantId: string, rule: AutomationRule, payload: Record<string, unknown>, triggeredBy: string) => Promise<RunActionOutcome[]> | RunActionOutcome[],
  now: Date = new Date(),
): Promise<{ fired: string[]; skipped: string[] }> {
  const fired: string[] = [];
  const skipped: string[] = [];
  for (const { tenantId, rule } of listAllActiveRules(dataDir)) {
    const t = rule.trigger;
    if (t.kind !== "schedule") continue;
    if (t.nextRunAt && new Date(t.nextRunAt).getTime() <= now.getTime()) {
      const anchor = t.nextRunAt;
      const next = scheduleAnchor(t.cadence as ScheduleCadenceImport, t.timeUtc, new Date(anchor)).toISOString();
      const nextTrigger: AutomationRule["trigger"] = { ...t, nextRunAt: next };
      saveRule(dataDir, { ...rule, trigger: nextTrigger, version: rule.version + 1, updatedAt: now.toISOString(), updatedBy: "system/schedule" });
      const payload = { ruleId: rule.id, scheduleAnchor: anchor, firedAt: now.toISOString() };
      const run = await fireRule(dataDir, tenantId, { ...rule, trigger: nextTrigger }, "schedule", `sched:${anchor}`, payload, `system/schedule:${rule.id}`, now, dispatchActions);
      if (run) fired.push(run.id);
      else skipped.push(rule.id);
    }
  }
  return { fired, skipped };
}
type ScheduleCadenceImport = import("./types").ScheduleCadence;