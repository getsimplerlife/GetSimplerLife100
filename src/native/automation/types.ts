/**
 * native/automation/types.ts — Phase 3.7 native AUTOMATIONS / WORKFLOW
 * BUILDER (rules: typed-event or scheduled trigger → conditions → actions).
 *
 * This slice is the native answer to the workflow-automation catalog cluster
 * (Zapier/Make/n8n-style rows). Discipline mirrors 2.1–3.6 exactly:
 *   - tenant-keyed store + durable pending-write mirror + immutable
 *     native.automation.* audit; server-assigned ids ONLY (rul_/arn_/apw_),
 *   - every user-initiated write rides the Approval Queue verb-first:
 *     createRule / updateRule / activateRule / pauseRule / archiveRule /
 *     deleteRule / sendAutomationNotification / publishAutomationWebhook
 *     (verbs send/publish/create/update/activate/pause/archive/delete already
 *     in WRITE_VERB — the classification test asserts every one, the standing
 *     fail-open control), and every REUSED action lane keeps its own gate:
 *     tableWrite → 1.4 submitTableWrite (createTableRow), runTransform →
 *     3.5 submitTransformWrite ("run") — never a new write lane,
 *   - triggers: a typed native event from the Phase 1.1 registry (observed at
 *     the SINGLE emission choke point — outbound.publishWebhookEvent, where
 *     every slice already emits its native.* events; listener failure never
 *     breaks the webhook lane) OR a schedule via the 3.6 scheduleAnchor
 *     monotonic next-run math (REUSE — scheduler durability discipline),
 *   - conditions: bounded field comparisons over the event payload
 *     (eq/neq/gt/gte/lt/lte/contains/startsWith/endsWith/exists); an unknown
 *     field → NO match (fail-closed, never a silent blind match),
 *   - run ledger = durable ATTEMPTS with honest states ("queued",
 *     "auto-applied", "applied", "failed", "skipped"); notify deliveries
 *     record {to, sent, error} — NEVER a fabricated "sent"; a delivery that
 *     the email lane reports failed is recorded failed,
 *   - CONTROL: rule CRUD is approval-gated; on fire, actions without an
 *     explicit per-rule allow-list entry are QUEUED for approval; only
 *     rule-allow-listed action kinds auto-execute (system actor, audited).
 *     Kill switch = pause (reversible) / archive (terminal). Idempotent
 *     apply: the same triggerRef (event id / schedule anchor) never fires
 *     twice (double-trigger → no-op), and approval applies are idempotent,
 *   - caps: ≤50 rules/tenant, ≤10 conditions/rule, ≤10 actions/rule,
 *     ≤20 pending writes/tenant, ≤200 runs retained/tenant, ≤512KB payloads,
 *     ≤10 notify recipients, validate BEFORE the gate (never queue garbage),
 *   - typed native.automation.* events via the Phase 1.1 registry;
 *     AUTHED-ONLY surface (401 fail-closed); NO public share lane
 *     (3.2/3.3/3.5/3.6 precedent).
 */
export type RuleStatus = "draft" | "active" | "paused" | "archived"; // archived = terminal
export const RULE_STATUSES: readonly RuleStatus[] = ["draft", "active", "paused", "archived"] as const;
export type TriggerKind = "event" | "schedule";
export type ScheduleCadence = "daily" | "weekly" | "monthly";
export const SCHEDULE_CADENCES: readonly ScheduleCadence[] = ["daily", "weekly", "monthly"] as const;
export type ConditionOp =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "contains" | "startsWith" | "endsWith" | "exists";
export const CONDITION_OPS: readonly ConditionOp[] = [
  "eq", "neq", "gt", "gte", "lt", "lte", "contains", "startsWith", "endsWith", "exists",
] as const;
export type ActionKind = "tableWrite" | "runTransform" | "notify" | "webhook";
export const ACTION_KINDS: readonly ActionKind[] = ["tableWrite", "runTransform", "notify", "webhook"] as const;

/** Event trigger: a typed event from the Phase 1.1 registry. */
export interface EventTrigger {
  kind: "event";
  /** Exact registry event type (e.g. "native.forms.submitted"). Non-empty. */
  eventType: string;
}
/** Schedule trigger: monotonic next-run via scheduleAnchor (3.6 math). */
export interface ScheduleTrigger {
  kind: "schedule";
  cadence: ScheduleCadence;
  /** "HH:MM" UTC — the daily anchor time. */
  timeUtc: string;
  /** Durable next-run anchor — the sweeper fires when nextRunAt <= now. */
  nextRunAt: string;
}
export type AutomationTrigger = EventTrigger | ScheduleTrigger;

/** One field comparison on the trigger payload (flattened, dotted paths). */
export interface AutomationCondition {
  /** Dotted path into the payload, e.g. "rowData.amount" or "eventType". */
  field: string;
  op: ConditionOp;
  /** eq/neq/gt/gte/lt/lte compare scalars; contains/startsWith/endsWith are
   *  string ops; exists ignores value (true = field present). */
  value?: unknown;
}

/** A rule action. Every kind maps to a REUSED lane (never a new write lane):
 *  tableWrite → 1.4 tables gate; runTransform → 3.5 transform gate;
 *  notify → 2.4 email lane; webhook → 1.1 publishWebhookEvent. */
export type AutomationAction =
  | {
      kind: "tableWrite";
      /** 1.4 table id — validated to EXIST in-tenant before the queue. */
      tableId: string;
      /** Row data (as the portal would send to createTableRow). */
      row: Record<string, unknown>;
    }
  | {
      kind: "runTransform";
      /** 3.5 transform id — validated to EXIST + be active before queue. */
      transformId: string;
      /** Source text the transform will parse/map ("" allowed when the
       *  transform reads a table; fail-closed validation at the 3.5 gate). */
      source?: string;
    }
  | {
      kind: "notify";
      /** ≤ MAX_NOTIFY_RECIPIENTS validated emails. */
      recipients: string[];
      subject: string;
      body: string;
    }
  | {
      kind: "webhook";
      /** Typed event to publish to the tenant's 1.1 outbound subscriptions. */
      eventType: string;
      /** ≤512KB payload. */
      payload: Record<string, unknown>;
    };

export interface AutomationRule {
  id: string; // rul_<random> — server-assigned
  tenantId: string;
  name: string;
  description: string;
  status: RuleStatus;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  /** Explicit per-rule autonomy allow-list: ONLY these action kinds
   *  auto-execute when the rule fires (system actor, audited). Everything
   *  else queues for human approval. [] = nothing auto-executes. */
  autonomyAllowList: ActionKind[];
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Per-action outcome inside a run — HONEST attempt states. */
export interface RunActionOutcome {
  kind: ActionKind;
  /** queued = awaiting approval; auto-applied = rule allow-list executed it;
   *  applied = executed; failed = executor error; skipped = not executed
   *  (e.g. earlier action failed / daily cap). */
  state: "queued" | "auto-applied" | "applied" | "failed" | "skipped";
  /** Linked pending-write id when this action rides our own mirror. */
  ptwId?: string;
  /** Linked approval action id (our mirror OR the reused lane's). */
  approvalActionId?: string;
  /** Reused-lane result (rowId / runId / deliveryCount). */
  detail?: string;
  deliveries?: Array<{ to: string; sent: boolean; error?: string }>;
  error?: string;
}

/** Durable run ledger entry — an ATTEMPT, never a fabricated success. */
export interface AutomationRun {
  id: string; // arn_<random>
  tenantId: string;
  ruleId: string;
  ruleName: string;
  triggerKind: TriggerKind;
  /** Idempotency key: event id for event triggers, schedule anchor for
   *  scheduled triggers. Double delivery of the same ref → no-op. */
  triggerRef: string;
  triggeredBy: string; // user email or "system/schedule:<ruleId>"
  triggeredAt: string;
  /** true when conditions matched AND actions were dispatched. */
  matched: boolean;
  conditions: Array<{ field: string; op: ConditionOp; value?: unknown; ok: boolean }>;
  actions: RunActionOutcome[];
  error?: string;
}

export type AutomationOp =
  | "createRule" | "updateRule" | "activateRule" | "pauseRule" | "archiveRule" | "deleteRule"
  | "sendAutomationNotification" | "publishAutomationWebhook";

export interface PendingAutomationWrite {
  id: string; // apw_<random>
  tenantId: string;
  op: AutomationOp;
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { runId?: string; detail?: string; error?: string };
  error?: string;
}

// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_RULES_PER_TENANT = 50;
export const MAX_CONDITIONS_PER_RULE = 10;
export const MAX_ACTIONS_PER_RULE = 10;
export const MAX_PENDING_AUTOMATION_WRITES = 20;
export const MAX_RUNS_PER_TENANT = 200; // retention trim (first-in evicted)
export const MAX_RUNS_PER_DAY_PER_RULE = 100; // bounded action executions/day
export const MAX_NAME = 120;
export const MAX_DESCRIPTION = 500;
export const MAX_NOTIFY_RECIPIENTS = 10;
export const MAX_TOPIC = 200; // webhook eventType
export const MAX_SUBJECT = 120;
export const MAX_BODY = 4000;
export const MAX_PAYLOAD_BYTES = 512 * 1024; // ≤512KB payloads (webhook + source)
export const FIELD_KEY_RE = /^[A-Za-z0-9_.-]{1,80}$/;
export const TIME_UTC_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const EVENT_TYPE_RE = /^native\.[A-Za-z0-9_.-]{2,80}$/;
// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_AUTOMATION_RULES_KEY = "native_automation_rules.json";
export const NATIVE_AUTOMATION_RUNS_KEY = "native_automation_runs.json";
export const NATIVE_AUTOMATION_PENDING_KEY = "native_automation_pending.json";
export const NATIVE_AUTOMATION_AUDIT_KEY = "native_automation_audit.json";