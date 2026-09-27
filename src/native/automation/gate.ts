/**
 * native/automation/gate.ts — GATED WRITE PATH + ACTION DISPATCH for Phase 3.7
 * native automations / workflow builder.
 *
 *   - validation BEFORE the gate: bad body / forged ids / unknown trigger
 *     event types / unknown table/transform refs / caps / bad cadence /
 *     non-string fields NEVER queue (400 / 404-no-IDOR),
 *   - every user-initiated write rides the Approval Queue verb-first
 *     (createRule/updateRule/activateRule/pauseRule/archiveRule/deleteRule/
 *     sendAutomationNotification/publishAutomationWebhook — all verbs in
 *     WRITE_VERB; the classification test asserts each one),
 *   - ACTION DISPATCH (on a matched fire): each action maps to a REUSED lane:
 *     tableWrite  → 1.4 submitTableWrite("insert")  — the tables gate decides
 *     runTransform → 3.5 submitTransformWrite("run") — the transform gate decides
 *     notify      → 2.4 email lane (injectable sender; durable intent with
 *                   HONEST {to,sent,error} outcome — never fabricated "sent")
 *     webhook     → 1.1 publishWebhookEvent (durable outbound deliveries)
 *   - CONTROL: rule-allow-listed action kinds auto-execute (system actor,
 *     audited); all others are queued on OUR mirror for approval. A rule's
 *     activation IS the human gate; the fire then dispatches on that
 *     allow-list exactly like 3.1 calendar-sync / 3.6 sweeper precedent,
 *   - idempotent apply: executePendingAutomationWrite is replay-safe
 *     (alreadyApplied → ok without re-running); engine double-trigger no-ops.
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { isRegisteredEventType } from "../webhooks/registry";
import { publishWebhookEvent, setNativeEventObserver } from "../webhooks/outbound";
import { submitTableWrite } from "../tables/gate";
import { submitTransformWrite } from "../transform/gate";
import { sendEmail as defaultSendEmail } from "../../integrations/email";
import { randomBytes } from "node:crypto";
import {
  ACTION_KINDS,
  CONDITION_OPS,
  EVENT_TYPE_RE,
  FIELD_KEY_RE,
  MAX_ACTIONS_PER_RULE,
  MAX_BODY,
  MAX_CONDITIONS_PER_RULE,
  MAX_DESCRIPTION,
  MAX_NAME,
  MAX_NOTIFY_RECIPIENTS,
  MAX_PAYLOAD_BYTES,
  MAX_PENDING_AUTOMATION_WRITES,
  MAX_RULES_PER_TENANT,
  MAX_SUBJECT,
  SCHEDULE_CADENCES,
  TIME_UTC_RE,
  type ActionKind,
  type AutomationAction,
  type AutomationCondition,
  type AutomationOp,
  type AutomationRule,
  type PendingAutomationWrite,
  type RunActionOutcome,
  type RuleStatus,
} from "./types";
import {
  appendAudit,
  deleteRuleRecord,
  generateAutomationEntityId,
  getPendingWriteByAction,
  getRule,
  listPendingWrites,
  listRules,
  markPendingWrite,
  savePendingWrite,
  saveRule,
  updateRun,
} from "./store";
import { getTable } from "../tables/store";
import { getTransform } from "../transform/store";

export interface AutomationWriteRequest {
  rule?: {
    id?: string; // FORGED-ID GUARD — rejected
    name?: string;
    description?: string;
    trigger?: Record<string, unknown>;
    conditions?: unknown[];
    actions?: unknown[];
    autonomyAllowList?: unknown[];
  };
  /** notify/webhook action payloads (queued action executions). */
  action?: {
    ruleId?: string;
    recipients?: string[];
    subject?: string;
    body?: string;
    eventType?: string;
    payload?: Record<string, unknown>;
  };
  via?: string;
}
export type AutomationWriteResult =
  | { applied: true; pending: false; ruleId?: string | undefined; op: AutomationOp; autonomy: boolean; actionId?: string | undefined }
  | { applied: false; pending: true; approvalActionId: string; op: AutomationOp }
  | { applied: false; pending: false; error: string };

export interface EmailSender {
  (o: { to: string; subject: string; text: string; html?: string }): Promise<{ success: boolean; error?: string }>;
}
interface MailOutcome { sent: boolean; error?: string }
let emailSender: EmailSender = async (o) => {
  try {
    const r = await defaultSendEmail(o);
    return { success: r.success, ...(r.error ? { error: r.error } : {}) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};
export function setAutomationEmailSenderForTest(sender: EmailSender | null): void {
  emailSender = sender ?? (async (o) => {
    try {
      const r = await defaultSendEmail(o);
      return { success: r.success, ...(r.error ? { error: r.error } : {}) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
}
async function mail(to: string, subject: string, text: string): Promise<MailOutcome> {
  try {
    const r = await emailSender({ to, subject, text });
    return { sent: r.success, ...(r.error ? { error: r.error } : {}) };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validateName(v: unknown): string {
  const name = typeof v === "string" ? v.trim() : "";
  if (!name) throw new Error("name is required");
  if (name.length > MAX_NAME) throw new Error(`name must be ≤${MAX_NAME} chars`);
  return name;
}
function validateEmails(recipients: unknown, label: string): string[] {
  if (!Array.isArray(recipients) || recipients.length === 0 || recipients.length > MAX_NOTIFY_RECIPIENTS) {
    throw new Error(`${label} needs 1..${MAX_NOTIFY_RECIPIENTS} recipient emails`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of recipients) {
    if (typeof r !== "string" || !EMAIL_RE.test(r)) throw new Error(`${label} recipient must be a valid email`);
    const key = r.toLowerCase();
    if (seen.has(key)) throw new Error(`${label} has duplicate recipient "${r}"`);
    seen.add(key);
    out.push(r);
  }
  return out;
}
function validateTrigger(_dataDir: string, _tenantId: string, t: unknown): AutomationRule["trigger"] {
  if (!t || typeof t !== "object" || Array.isArray(t)) throw new Error("trigger is required");
  const kind = (t as Record<string, unknown>).kind;
  if (kind === "event") {
    const eventType = (t as Record<string, unknown>).eventType;
    if (typeof eventType !== "string" || !EVENT_TYPE_RE.test(eventType)) {
      throw new Error("event trigger needs eventType like native.<domain>.<action>");
    }
    if (!isRegisteredEventType(eventType)) {
      throw new Error(`event type "${eventType}" is not registered in the native registry`);
    }
    return { kind: "event", eventType };
  }
  if (kind === "schedule") {
    const body = t as Record<string, unknown>;
    if (typeof body.cadence !== "string" || !SCHEDULE_CADENCES.includes(body.cadence as (typeof SCHEDULE_CADENCES)[number])) {
      throw new Error(`schedule cadence must be one of ${SCHEDULE_CADENCES.join("|")}`);
    }
    if (typeof body.timeUtc !== "string" || !TIME_UTC_RE.test(body.timeUtc)) throw new Error("schedule timeUtc must be HH:MM (UTC)");
    return { kind: "schedule", cadence: body.cadence as ScheduleCadence, timeUtc: body.timeUtc, nextRunAt: new Date().toISOString() };
  }
  throw new Error("trigger kind must be event|schedule");
}
function validateConditions(raw: unknown): AutomationCondition[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_CONDITIONS_PER_RULE) {
    throw new Error(`conditions must be an array of ≤${MAX_CONDITIONS_PER_RULE}`);
  }
  const out: AutomationCondition[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object" || Array.isArray(c)) throw new Error("each condition must be an object");
    const field = (c as Record<string, unknown>).field;
    const op = (c as Record<string, unknown>).op;
    if (typeof field !== "string" || !FIELD_KEY_RE.test(field)) throw new Error("condition field must match [A-Za-z0-9_.-] (≤80)");
    if (typeof op !== "string" || !CONDITION_OPS.includes(op as (typeof CONDITION_OPS)[number])) {
      throw new Error(`condition op must be one of ${CONDITION_OPS.join("|")}`);
    }
    if (op === "exists" && (c as Record<string, unknown>).value !== undefined) {
      throw new Error("exists conditions carry no value");
    }
    out.push({ field, op: op as AutomationCondition["op"], value: (c as Record<string, unknown>).value });
  }
  return out;
}
function payloadBytes(p: Record<string, unknown>): number {
  try {
    return Buffer.byteLength(JSON.stringify(p), "utf-8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
function validateActions(
  dataDir: string,
  tenantId: string,
  raw: unknown,
): AutomationAction[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ACTIONS_PER_RULE) {
    throw new Error(`actions must be an array of 1..${MAX_ACTIONS_PER_RULE}`);
  }
  const out: AutomationAction[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object" || Array.isArray(a)) throw new Error("each action must be an object");
    const kind = (a as Record<string, unknown>).kind;
    if (typeof kind !== "string" || !ACTION_KINDS.includes(kind as ActionKind)) {
      throw new Error(`action kind must be one of ${ACTION_KINDS.join("|")}`);
    }
    if (kind === "tableWrite") {
      const tableId = (a as Record<string, unknown>).tableId;
      if (typeof tableId !== "string" || !/^tbl_[A-Za-z0-9_-]+$/.test(tableId)) throw new Error("tableWrite action needs a valid table id (tbl_)");
      if (!getTable(dataDir, tenantId, tableId)) throw new Error("tableWrite action table not found"); // 404-no-IDOR
      const row = (a as Record<string, unknown>).row;
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("tableWrite action needs a row object");
      if (payloadBytes(row as Record<string, unknown>) > MAX_PAYLOAD_BYTES) throw new Error("tableWrite row exceeds the 512KB payload cap");
      out.push({ kind: "tableWrite", tableId, row: row as Record<string, unknown> });
    } else if (kind === "runTransform") {
      const transformId = (a as Record<string, unknown>).transformId;
      if (typeof transformId !== "string" || !/^trf_[A-Za-z0-9_-]+$/.test(transformId)) throw new Error("runTransform action needs a valid transform id (trf_)");
      const def = getTransform(dataDir, tenantId, transformId);
      if (!def) throw new Error("runTransform action transform not found"); // 404-no-IDOR
      if (def.status !== "active") throw new Error("runTransform action transform is not active");
      const source = (a as Record<string, unknown>).source;
      if (source !== undefined && typeof source !== "string") throw new Error("runTransform source must be a string");
      if (typeof source === "string" && Buffer.byteLength(source, "utf-8") > MAX_PAYLOAD_BYTES) throw new Error("runTransform source exceeds the 512KB cap");
      out.push({ kind: "runTransform", transformId, source: source ?? "" });
    } else if (kind === "notify") {
      const body = a as Record<string, unknown>;
      const recipients = validateEmails(body.recipients, "notify");
      const subject = typeof body.subject === "string" ? body.subject.trim() : "";
      if (!subject || subject.length > MAX_SUBJECT) throw new Error(`notify subject must be 1..${MAX_SUBJECT} chars`);
      const text = typeof body.body === "string" ? body.body : "";
      if (!text || text.length > MAX_BODY) throw new Error(`notify body must be 1..${MAX_BODY} chars`);
      out.push({ kind: "notify", recipients, subject, body: text });
    } else {
      const body = a as Record<string, unknown>;
      const eventType = body.eventType;
      if (typeof eventType !== "string" || !EVENT_TYPE_RE.test(eventType)) throw new Error("webhook action needs eventType like native.<domain>.<action>");
      if (!isRegisteredEventType(eventType)) throw new Error(`webhook event type "${eventType}" is not registered`);
      const payload = (body.payload ?? {}) as Record<string, unknown>;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("webhook action needs a payload object");
      if (payloadBytes(payload) > MAX_PAYLOAD_BYTES) throw new Error("webhook payload exceeds the 512KB cap");
      out.push({ kind: "webhook", eventType, payload });
    }
  }
  return out;
}
function validateAutonomyAllowList(raw: unknown): ActionKind[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > ACTION_KINDS.length) throw new Error("autonomyAllowList must be an array of action kinds");
  const seen = new Set<ActionKind>();
  for (const k of raw) {
    if (typeof k !== "string" || !ACTION_KINDS.includes(k as ActionKind)) throw new Error(`autonomyAllowList kind must be one of ${ACTION_KINDS.join("|")}`);
    seen.add(k as ActionKind);
  }
  return [...seen];
}
function requireRuleId(req: AutomationWriteRequest): string {
  const id = req.rule?.id ?? "";
  if (!/^rul_[A-Za-z0-9_-]+$/.test(id)) throw new Error("ruleId is required");
  return id;
}
function validateWrite(dataDir: string, tenantId: string, op: AutomationOp, req: AutomationWriteRequest): void {
  switch (op) {
    case "createRule": {
      const body = (req.rule ?? {}) as Record<string, unknown>;
      if ("id" in body && body.id !== undefined) throw new Error("client-supplied rule ids are not accepted");
      if (listRules(dataDir, tenantId).length >= MAX_RULES_PER_TENANT) throw new Error(`rule cap reached (${MAX_RULES_PER_TENANT})`);
      validateRuleBody(dataDir, tenantId, body);
      return;
    }
    case "updateRule": {
      const id = requireRuleId(req);
      const r = getRule(dataDir, tenantId, id);
      if (!r) throw new Error("rule not found");
      if (r.status !== "draft") throw new Error("rules can only be edited in draft");
      validateRuleBody(dataDir, tenantId, (req.rule ?? {}) as Record<string, unknown>);
      return;
    }
    case "deleteRule": {
      const id = requireRuleId(req);
      const r = getRule(dataDir, tenantId, id);
      if (!r) throw new Error("rule not found");
      if (r.status !== "draft" && r.status !== "paused") throw new Error("only draft or paused rules can be deleted");
      return;
    }
    case "activateRule": {
      const id = requireRuleId(req);
      const r = getRule(dataDir, tenantId, id);
      if (!r) throw new Error("rule not found");
      if (r.status !== "draft" && r.status !== "paused") throw new Error("only draft or paused rules can be activated");
      if (r.actions.length === 0) throw new Error("cannot activate a rule with no actions");
      return;
    }
    case "pauseRule": {
      const id = requireRuleId(req);
      const r = getRule(dataDir, tenantId, id);
      if (!r) throw new Error("rule not found");
      if (r.status !== "active") throw new Error("only active rules can be paused");
      return;
    }
    case "archiveRule": {
      const id = requireRuleId(req);
      const r = getRule(dataDir, tenantId, id);
      if (!r) throw new Error("rule not found");
      if (r.status !== "active" && r.status !== "paused") throw new Error("only active or paused rules can be archived");
      return;
    }
    case "sendAutomationNotification":
    case "publishAutomationWebhook": {
      const body = (req.action ?? {}) as Record<string, unknown>;
      const ruleId = typeof body.ruleId === "string" ? body.ruleId : "";
      if (!/^rul_[A-Za-z0-9_-]+$/.test(ruleId)) throw new Error("action needs ruleId (rul_)");
      if (!getRule(dataDir, tenantId, ruleId)) throw new Error("rule not found");
      if (op === "sendAutomationNotification") {
        validateEmails(body.recipients, "notify");
        const subject = typeof body.subject === "string" ? body.subject.trim() : "";
        if (!subject || subject.length > MAX_SUBJECT) throw new Error(`notify subject must be 1..${MAX_SUBJECT} chars`);
        const text = typeof body.body === "string" ? body.body : "";
        if (!text || text.length > MAX_BODY) throw new Error(`notify body must be 1..${MAX_BODY} chars`);
      } else {
        const eventType = body.eventType;
        if (typeof eventType !== "string" || !EVENT_TYPE_RE.test(eventType)) throw new Error("webhook action needs eventType like native.<domain>.<action>");
        if (!isRegisteredEventType(eventType)) throw new Error(`webhook event type "${eventType}" is not registered`);
        const payload = (body.payload ?? {}) as Record<string, unknown>;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("webhook action needs a payload object");
        if (payloadBytes(payload) > MAX_PAYLOAD_BYTES) throw new Error("webhook payload exceeds the 512KB cap");
      }
      const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
      if (pending.length >= MAX_PENDING_AUTOMATION_WRITES) throw new Error(`Pending-write cap reached (${MAX_PENDING_AUTOMATION_WRITES}) — approve or reject before more`);
      return;
    }
  }
}
function validateRuleBody(
  dataDir: string,
  tenantId: string,
  body: Record<string, unknown>,
): void {
  validateName(body.name);
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > MAX_DESCRIPTION)) {
    throw new Error(`description must be ≤${MAX_DESCRIPTION} chars`);
  }
  validateTrigger(dataDir, tenantId, body.trigger);
  validateConditions(body.conditions);
  validateActions(dataDir, tenantId, body.actions);
  validateAutonomyAllowList(body.autonomyAllowList);
}
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-automation");
  } catch { /* event publish is best-effort after the durable record */ }
}

/** EXECUTE a notify action (2.4 email lane, injectable). Returns honest
 *  per-recipient outcomes — a failed send is recorded failed, never "sent". */
async function executeNotify(recipients: string[], subject: string, body: string): Promise<Array<{ to: string; sent: boolean; error?: string }>> {
  const deliveries: Array<{ to: string; sent: boolean; error?: string }> = [];
  for (const to of recipients) {
    const r = await mail(to, subject, body);
    deliveries.push({ to, sent: r.sent, ...(r.error ? { error: r.error } : {}) });
  }
  return deliveries;
}

/** DISPATCH a rule's actions after a matched fire. Called by the engine with
 *  the rule that FIRED. Allow-listed kinds execute now (system actor,
 *  audited); everything else queues on our mirror for approval. REUSED lanes
 *  (tables / transform) keep their own gates — we never open a new write lane. */
export async function dispatchAutomationActions(
  dataDir: string,
  tenantId: string,
  rule: AutomationRule,
  payload: Record<string, unknown>,
  triggeredBy: string,
): Promise<RunActionOutcome[]> {
  const outcomes: RunActionOutcome[] = [];
  void payload; // trigger payload is available for future conditions/templates; outcomes are lane-driven
  for (const action of rule.actions) {
    if (action.kind === "notify" && rule.autonomyAllowList.includes("notify")) {
      // auto-execute: AWAIT the lane, then record the honest outcome on the run ledger
      // (never fabricated "sent" — the run is saved after this dispatch resolves).
      try {
        const deliveries = await executeNotify(action.recipients, action.subject, action.body);
        const anySent = deliveries.some((d) => d.sent);
        outcomes.push({ kind: "notify", state: anySent ? "auto-applied" : "failed", deliveries, error: deliveries.every((d) => !d.sent) ? "email delivery failed" : undefined });
        appendAudit(dataDir, { tenantId, actor: triggeredBy, action: "native.automation.action.auto-applied", ruleId: rule.id, detail: `notify to ${action.recipients.join(",")} (${deliveries.filter((d) => d.sent).length}/${deliveries.length} delivered)` });
        publishEvent(dataDir, tenantId, "native.automation.action.auto-applied", { ruleId: rule.id, kind: "notify" });
      } catch (err) {
        outcomes.push({ kind: "notify", state: "failed", error: err instanceof Error ? err.message : String(err) });
        appendAudit(dataDir, { tenantId, actor: triggeredBy, action: "native.automation.action.failed", ruleId: rule.id, detail: "notify auto-execution failed" });
      }
      continue;
    }
    if (action.kind === "webhook" && rule.autonomyAllowList.includes("webhook")) {
      try {
        const n = publishWebhookEvent(dataDir, tenantId, action.eventType, { ...action.payload, ruleId: rule.id, triggeredAt: new Date().toISOString() }, triggeredBy);
        outcomes.push({ kind: "webhook", state: "auto-applied", detail: `queued ${n} outbound delivery(ies)` });
        appendAudit(dataDir, { tenantId, actor: triggeredBy, action: "native.automation.action.auto-applied", ruleId: rule.id, detail: `webhook ${action.eventType} → ${n} subscription(s)` });
      } catch (e) {
        outcomes.push({ kind: "webhook", state: "failed", error: e instanceof Error ? e.message : String(e) });
        appendAudit(dataDir, { tenantId, actor: triggeredBy, action: "native.automation.action.failed", ruleId: rule.id, detail: `webhook ${action.eventType} failed` });
      }
      continue;
    }
    if (action.kind === "tableWrite") {
      // REUSED 1.4 lane — the tables gate decides (approval or its own autonomy)
      try {
        const res = submitTableWrite(dataDir, tenantId, action.tableId, "insert", { rowData: { ...action.row } }, triggeredBy);
        if (res.applied) outcomes.push({ kind: "tableWrite", state: "applied", detail: `row ${res.rowId ?? ""}` });
        else if ("pending" in res && res.pending) outcomes.push({ kind: "tableWrite", state: "queued", approvalActionId: res.approvalActionId, detail: "queued on tables approval lane" });
        else outcomes.push({ kind: "tableWrite", state: "failed", error: "error" in res ? String(res.error) : "table write failed" });
      } catch (e) {
        outcomes.push({ kind: "tableWrite", state: "failed", error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }
    if (action.kind === "runTransform") {
      // REUSED 3.5 lane — the transform gate decides
      try {
        const res = submitTransformWrite(dataDir, tenantId, "run", { transformId: action.transformId, source: action.source ?? "", via: `automation:${rule.id}` }, triggeredBy);
        if (res.applied) outcomes.push({ kind: "runTransform", state: "applied", detail: `run ${res.runId ?? ""}` });
        else if ("pending" in res && res.pending) outcomes.push({ kind: "runTransform", state: "queued", approvalActionId: res.approvalActionId, detail: "queued on transform approval lane" });
        else outcomes.push({ kind: "runTransform", state: "failed", error: "error" in res ? String(res.error) : "transform run failed" });
      } catch (e) {
        outcomes.push({ kind: "runTransform", state: "failed", error: e instanceof Error ? e.message : String(e) });
      }
      continue;
    }
    if (action.kind === "notify") {
      // QUEUE on our mirror → human approves → executeNotify at apply
      const res = submitAutomationWrite(dataDir, tenantId, "sendAutomationNotification", {
        action: { ruleId: rule.id, recipients: action.recipients, subject: action.subject, body: action.body },
        via: `automation:${rule.id}`,
      }, triggeredBy);
      outcomes.push(
        res.applied
          ? { kind: "notify", state: "applied", approvalActionId: res.actionId }
          : "pending" in res && res.pending
            ? { kind: "notify", state: "queued", approvalActionId: res.approvalActionId, ptwId: ptwFor(dataDir, tenantId, res.approvalActionId)?.id }
            : { kind: "notify", state: "failed", error: "error" in res ? res.error : "notify queue failed" },
      );
      continue;
    }
    if (action.kind === "webhook") {
      const res = submitAutomationWrite(dataDir, tenantId, "publishAutomationWebhook", {
        action: { ruleId: rule.id, eventType: action.eventType, payload: { ...action.payload, ruleId: rule.id } },
        via: `automation:${rule.id}`,
      }, triggeredBy);
      outcomes.push(
        res.applied
          ? { kind: "webhook", state: "applied", approvalActionId: res.actionId }
          : "pending" in res && res.pending
            ? { kind: "webhook", state: "queued", approvalActionId: res.approvalActionId, ptwId: ptwFor(dataDir, tenantId, res.approvalActionId)?.id }
            : { kind: "webhook", state: "failed", error: "error" in res ? res.error : "webhook queue failed" },
      );
      continue;
    }
  }
  return outcomes;
}
function ptwFor(dataDir: string, tenantId: string, approvalActionId: string): PendingAutomationWrite | null {
  return getPendingWriteByAction(dataDir, tenantId, approvalActionId);
}

/** Apply a rule body (create or update). */
function applyRuleBody(
  dataDir: string,
  tenantId: string,
  op: "create" | "update",
  req: AutomationWriteRequest,
  actor: string,
  autonomy: boolean,
): { ok: boolean; error?: string; ruleId?: string } {
  const now = new Date().toISOString();
  const who = autonomy ? "system/autonomy" : actor;
  const body = (req.rule ?? {}) as Record<string, unknown>;
  const name = validateName(body.name);
  const description = typeof body.description === "string" ? body.description : "";
  const trigger = validateTrigger(dataDir, tenantId, body.trigger);
  const conditions = validateConditions(body.conditions);
  const actions = validateActions(dataDir, tenantId, body.actions);
  const autonomyAllowList = validateAutonomyAllowList(body.autonomyAllowList);
  if (op === "create") {
    const rule: AutomationRule = {
      id: generateAutomationEntityId("rul"),
      tenantId,
      name,
      description,
      status: "draft",
      trigger,
      conditions,
      actions,
      autonomyAllowList,
      version: 1,
      createdAt: now,
      createdBy: who,
      updatedAt: now,
      updatedBy: who,
    };
    saveRule(dataDir, rule);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.automation.rule.created", ruleId: rule.id, detail: `Created rule "${rule.name}" (${rule.trigger.kind} trigger, ${rule.actions.length} action(s))` });
    publishEvent(dataDir, tenantId, "native.automation.rule.created", { ruleId: rule.id });
    return { ok: true, ruleId: rule.id };
  }
  const existing = getRule(dataDir, tenantId, requireRuleId(req));
  if (!existing) return { ok: false, error: "rule not found" };
  const next: AutomationRule = {
    ...existing,
    name,
    description,
    trigger,
    conditions,
    actions,
    autonomyAllowList,
    version: existing.version + 1,
    updatedAt: now,
    updatedBy: who,
  };
  saveRule(dataDir, next);
  appendAudit(dataDir, { tenantId, actor: who, action: "native.automation.rule.updated", ruleId: next.id, detail: `Updated rule "${next.name}" (v${next.version})` });
  publishEvent(dataDir, tenantId, "native.automation.rule.updated", { ruleId: next.id });
  return { ok: true, ruleId: next.id };
}
function lifecycleNow(
  dataDir: string,
  tenantId: string,
  op: AutomationOp,
  req: AutomationWriteRequest,
  actor: string,
  autonomy: boolean,
): { ok: boolean; error?: string; ruleId?: string } {
  const id = requireRuleId(req);
  const rule = getRule(dataDir, tenantId, id);
  if (!rule) return { ok: false, error: "rule not found" };
  const now = new Date().toISOString();
  const who = autonomy ? "system/autonomy" : actor;
  let status: RuleStatus = rule.status;
  let actionAudit = "";
  if (op === "activateRule") {
    if (rule.status !== "draft" && rule.status !== "paused") return { ok: false, error: "only draft or paused rules can be activated" };
    status = "active";
    actionAudit = "native.automation.rule.activated";
  } else if (op === "pauseRule") {
    if (rule.status !== "active") return { ok: false, error: "only active rules can be paused" };
    status = "paused";
    actionAudit = "native.automation.rule.paused";
  } else if (op === "archiveRule") {
    if (rule.status !== "active" && rule.status !== "paused") return { ok: false, error: "only active or paused rules can be archived" };
    status = "archived";
    actionAudit = "native.automation.rule.archived";
  } else if (op === "deleteRule") {
    if (rule.status !== "draft" && rule.status !== "paused") return { ok: false, error: "only draft or paused rules can be deleted" };
    deleteRuleRecord(dataDir, tenantId, id);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.automation.rule.deleted", ruleId: id, detail: `Deleted rule "${rule.name}"` });
    publishEvent(dataDir, tenantId, "native.automation.rule.deleted", { ruleId: id });
    return { ok: true, ruleId: id };
  }
  const next: AutomationRule = { ...rule, status, version: rule.version + 1, updatedAt: now, updatedBy: who };
  saveRule(dataDir, next);
  appendAudit(dataDir, { tenantId, actor: who, action: actionAudit, ruleId: id, detail: `Rule "${rule.name}" → ${status}` });
  publishEvent(dataDir, tenantId, actionAudit, { ruleId: id, status });
  return { ok: true, ruleId: id };
}
function applyNow(
  dataDir: string,
  tenantId: string,
  op: AutomationOp,
  req: AutomationWriteRequest,
  actor: string,
  autonomy: boolean,
): { ok: boolean; error?: string; ruleId?: string } {
  switch (op) {
    case "createRule": return applyRuleBody(dataDir, tenantId, "create", req, actor, autonomy);
    case "updateRule": return applyRuleBody(dataDir, tenantId, "update", req, actor, autonomy);
    case "activateRule":
    case "pauseRule":
    case "archiveRule":
    case "deleteRule":
      return lifecycleNow(dataDir, tenantId, op, req, actor, autonomy);
    case "sendAutomationNotification": {
      const body = (req.action ?? {}) as Record<string, unknown>;
      const ruleId = typeof body.ruleId === "string" ? body.ruleId : "";
      void ruleId;
      // async email — durable intent recorded in audit; outcome tied to run
      void (async () => {
        const deliveries = await executeNotify(
          validateEmails(body.recipients, "notify"),
          typeof body.subject === "string" ? body.subject : "",
          typeof body.body === "string" ? body.body : "",
        );
        appendAudit(dataDir, { tenantId, actor, action: "native.automation.notify.sent", ruleId, detail: `notify ${deliveries.filter((d) => d.sent).length}/${deliveries.length} delivered` });
        // tie back to the most recent queued run action for this rule
        const runs = listRunsForRule(dataDir, tenantId, ruleId);
        const target = [...runs].reverse().find((r) => r.actions.some((a) => a.kind === "notify" && a.state === "queued"));
        if (target) updateRun(dataDir, tenantId, target.id, (run) => ({
          ...run,
          actions: run.actions.map((a) => a.kind === "notify" && a.state === "queued"
            ? { ...a, state: deliveries.some((d) => d.sent) ? "applied" : "failed", deliveries, error: deliveries.every((d) => !d.sent) ? "email delivery failed" : undefined }
            : a),
        }));
      })().catch(() => undefined);
      return { ok: true };
    }
    case "publishAutomationWebhook": {
      const body = (req.action ?? {}) as Record<string, unknown>;
      const ruleId = typeof body.ruleId === "string" ? body.ruleId : "";
      const eventType = typeof body.eventType === "string" ? body.eventType : "";
      const payload = (body.payload ?? {}) as Record<string, unknown>;
      const n = publishWebhookEvent(dataDir, tenantId, eventType, payload, actor);
      appendAudit(dataDir, { tenantId, actor, action: "native.automation.webhook.published", ruleId, detail: `webhook ${eventType} → ${n} subscription(s)` });
      const runs = listRunsForRule(dataDir, tenantId, ruleId);
      const target = [...runs].reverse().find((r) => r.actions.some((a) => a.kind === "webhook" && a.state === "queued"));
      if (target) updateRun(dataDir, tenantId, target.id, (run) => ({
        ...run,
        actions: run.actions.map((a) => a.kind === "webhook" && a.state === "queued"
          ? { ...a, state: "applied", detail: `${n} delivery(ies) queued` }
          : a),
      }));
      return { ok: true };
    }
    default:
      return { ok: false, error: "unsupported op" };
  }
}
function listRunsForRule(dataDir: string, tenantId: string, ruleId: string) {
  return listRunsStore(dataDir, tenantId, ruleId);
}
import { listRuns as listRunsStore } from "./store";

/** Submit a gated automation write. Validation FIRST — bad writes 400 before
 *  the queue. */
export function submitAutomationWrite(
  dataDir: string,
  tenantId: string,
  op: AutomationOp,
  req: AutomationWriteRequest,
  actor: string,
): AutomationWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  try {
    validateWrite(dataDir, tenantId, op, req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = op; // action name IS the verb (all in WRITE_VERB)
  const ruleId = req.rule?.id ?? "";
  const gate = approvalGate(tenantId, action, "native-automation", { ruleId, op, via: req.via ?? "portal" }, { dataDir, workflowId: "native-automation" });
  if (gate.allowed) {
    const out = applyNow(dataDir, tenantId, op, req, actor, !!gate.autonomy);
    if (!out.ok) return { applied: false, pending: false, error: out.error ?? "apply failed" };
    if (gate.autonomy) recordAutonomyOutcome(tenantId, gate.workflowId || "native-automation", action, "native-automation", true, { dataDir, allowListId: gate.allowListId, target: ruleId });
    return { applied: true, pending: false, ...(out.ruleId ? { ruleId: out.ruleId } : {}), op, autonomy: !!gate.autonomy, ...(gate.actionId ? { actionId: gate.actionId } : {}) };
  }
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
  if (pending.length >= MAX_PENDING_AUTOMATION_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_AUTOMATION_WRITES}) — approve or reject before more` };
  }
  const ptw: PendingAutomationWrite = {
    id: generateAutomationEntityId("apw"),
    tenantId,
    op,
    payload: { ...req, via: req.via ?? "portal" },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: "native.automation.pending", ruleId: ruleId || undefined, detail: `Queued ${action} for approval (${ptw.id})` });
  publishEvent(dataDir, tenantId, "native.automation.pending", { op, ruleId, ptwId: ptw.id });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}
/** Approve-path executor: applies the approved write once (idempotent). */
export function executePendingAutomationWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; ruleId?: string; ptwId: string; alreadyApplied?: boolean } | { ok: false; reason: string; ptwId?: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status === "rejected") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied") {
    return { ok: true, alreadyApplied: true, ruleId: ptw.appliedResult?.detail ? undefined : undefined, ptwId: ptw.id };
  }
  try {
    validateWrite(dataDir, tenantId, ptw.op, ptw.payload as AutomationWriteRequest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", undefined, msg);
    appendAudit(dataDir, { tenantId, actor: "system", action: "native.automation.rejected", ruleId: (ptw.payload as AutomationWriteRequest)?.rule?.id, detail: `Apply re-validation failed: ${msg}` });
    return { ok: false, reason: msg, ptwId: ptw.id };
  }
  const out = applyNow(dataDir, tenantId, ptw.op, ptw.payload as AutomationWriteRequest, actor, false);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", undefined, out.error ?? "apply failed");
    appendAudit(dataDir, { tenantId, actor: "system", action: "native.automation.rejected", ruleId: (ptw.payload as AutomationWriteRequest)?.rule?.id, detail: `Apply failed: ${out.error ?? "unknown"}` });
    return { ok: false, reason: out.error ?? "apply failed", ptwId: ptw.id };
  }
  markPendingWrite(dataDir, tenantId, ptw.id, "applied", out.ruleId ? { detail: out.ruleId } : undefined);
  return { ok: true, ...(out.ruleId ? { ruleId: out.ruleId } : {}), ptwId: ptw.id };
}
/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingAutomationWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", ruleId: res.ruleId } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected");
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

/** Wire the 1.1 outbound observer → engine. Call ONCE at boot (prod-server).
 *  The engine then observes every typed native event at the emission choke
 *  point. Observer failures never break the webhook lane (outbound guards). */
export function wireAutomationEventObserver(): void {
  setNativeEventObserver((o) => {
    try {
      dispatchFromObserver(o.dataDir, o.tenantId, o.eventType, o.payload, o.actor);
    } catch (e) {
      console.error("[automation] event dispatch failed: " + (e instanceof Error ? e.message : String(e)));
    }
  });
}
function dispatchFromObserver(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>, actor: string): void {
  // guard against self-trigger loops: automation's own events never re-fire rules
  if (eventType.startsWith("native.automation.")) return;
  fireRuleForEvent(dataDir, tenantId, eventType, payload ?? {}, actor, dispatchAutomationActions);
}
import { fireRuleForEvent } from "./engine";
import type { ScheduleCadence } from "./types";