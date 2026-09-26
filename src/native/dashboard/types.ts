/**
 * native/dashboard/types.ts — Phase 3.6 native EMBEDDED DASHBOARDS/BI
 * (report builder over 1.4 tables + scheduled PDF/CSV/email distribution +
 * thresholds/alerts — the native answer to Metabase/Looker/Qlik/Sigma
 * distribution rows). Discipline mirrors 2.1–3.5 exactly:
 *   - tenant-keyed store + durable pending-write mirror + immutable
 *     native.dashboard.* audit; server-assigned ids ONLY (dsh_/rpt_/sch_/
 *     alr_/rsn_/ale_/pdw_),
 *   - every user-initiated write rides the Approval Queue verb-first:
 *     createDashboard / updateDashboard / deleteDashboard / createReport /
 *     updateReport / deleteReport / runReport / createSchedule /
 *     updateSchedule / activateSchedule / archiveSchedule / deleteSchedule /
 *     createAlertRule / updateAlertRule / deleteAlertRule (verbs run/activate/
 *     archive already in WRITE_VERB — the classification test asserts every
 *     one is a WRITE, the standing fail-open control),
 *   - validation BEFORE the gate: bad body / unknown ids / forged create-ids /
 *     field refs missing from the source table schema / caps / bad cadence /
 *     non-numeric thresholds / unknown report refs NEVER queue (the run is
 *     computed at queue time AND re-validated at apply),
 *   - deterministic PURE computation — NO LLM anywhere in this slice (the 3.3
 *     model client is never imported; the suite stays LLM-free); report runs
 *     read 1.4 table rows read-only via the tables store (listRows/getTable —
 *     zero cross-tenant paths; unknown/foreign table → 404),
 *   - schedules are the native "distribution" primitive: an ACTIVE (approved)
 *     schedule fires a sweeper that renders the report, stores a durable
 *     snapshot + CSV/PDF artifact (reusing the 1.2 dependency-free PDF
 *     writer), attempts best-effort email delivery via the 2.4 notification
 *     lane, evaluates linked alert rules, and audits + emits typed events for
 *     EVERY write it makes (the activation approval is the human gate; the
 *     sweep then runs on that explicit allow-list — 3.1 calendar-sync
 *     precedent, always audited, never re-queued),
 *   - typed events native.dashboard.* via the Phase 1.1 registry; authed-only
 *     surface (401 fail-closed); NO public share lane (3.2/3.3/3.5 precedent).
 */
export type ReportVizKind = "table" | "bar" | "line" | "number";
export const REPORT_VIZ_KINDS: readonly ReportVizKind[] = ["table", "bar", "line", "number"];
export type AggKind = "count" | "sum" | "avg" | "min" | "max";
export const AGG_KINDS: readonly AggKind[] = ["count", "sum", "avg", "min", "max"];
export type ScheduleCadence = "daily" | "weekly" | "monthly";
export const SCHEDULE_CADENCES: readonly ScheduleCadence[] = ["daily", "weekly", "monthly"];
export type ScheduleFormat = "pdf" | "csv";
export const SCHEDULE_FORMATS: readonly ScheduleFormat[] = ["pdf", "csv"];
export type AlertOp = "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
export const ALERT_OPS: readonly AlertOp[] = ["gt", "gte", "lt", "lte", "eq", "neq"];
/** A report reads ONE 1.4 table (row data read-only) and reduces it. */
export interface ReportDef {
  id: string; // rpt_<random> — server-assigned
  tenantId: string;
  name: string;
  description: string;
  /** 1.4 table id — validated to EXIST in-tenant before the queue. */
  sourceTableId: string;
  viz: ReportVizKind;
  /** Group-by field key (must exist in the source table schema). */
  groupBy?: string | null;
  /** Metric field key (agg applied over its values; count needs no field). */
  valueField?: string | null;
  agg: AggKind;
  /** Descending by computed value unless asc. */
  sortDir: "asc" | "desc";
  /** Max result rows (1..MAX_REPORT_ROWS). */
  limit: number;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
/** A dashboard groups report widgets (ordered). */
export interface DashboardDef {
  id: string; // dsh_<random>
  tenantId: string;
  name: string;
  description: string;
  /** Report ids rendered as widgets — each must exist in-tenant. */
  reportIds: string[];
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
/** Scheduled distribution of ONE report (PDF or CSV) to recipients. */
export interface ScheduleDef {
  id: string; // sch_<random>
  tenantId: string;
  reportId: string;
  name: string;
  cadence: ScheduleCadence;
  /** "HH:MM" in UTC — the daily anchor time. */
  timeUtc: string;
  format: ScheduleFormat;
  /** ≤ MAX_SCHEDULE_RECIPIENTS validated emails. */
  recipients: string[];
  status: "draft" | "active" | "archived"; // draft→active→archived (terminal)
  /** Durable next-run anchor: sweeper runs when nextRunAt <= now. */
  nextRunAt: string;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
/** Alert rule on a report metric (evaluated on every report RUN). */
export interface AlertRuleDef {
  id: string; // alr_<random>
  tenantId: string;
  reportId: string;
  name: string;
  /** Metric compared: the report's agg value (number report) or the sum of
   *  result values (grouped reports). `count` compares row counts. */
  metric: "agg" | "rows";
  op: AlertOp;
  threshold: number;
  /** Recipients notified on fire (validated, ≤ MAX_ALERT_RECIPIENTS). */
  recipients: string[];
  /** True while the condition is currently breached (edge re-fire dedupe). */
  active: boolean;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
/** Durable result of one report run (manual runReport or a schedule sweep). */
export interface ReportRun {
  id: string; // rsn_<random>
  tenantId: string;
  reportId: string;
  triggeredBy: string; // actor email or "system/schedule:<scheduleId>"
  triggeredAt: string;
  /** Reduced rows: [{ label, value }] — label null for number viz. */
  rows: Array<{ label: string | null; value: number }>;
  /** number-viz headline value (agg over the metric) — null for grouped. */
  headline: number | null;
  rowCount: number;
  /** Generated artifact (CSV text or PDF binary base64) when requested. */
  artifact?: { mime: string; kind: ScheduleFormat; base64: string } | null;
  /** Best-effort email delivery outcome per recipient. */
  deliveries?: Array<{ to: string; sent: boolean; error?: string }>;
  error?: string;
}
/** Fired alert record (durable, capped). */
export interface AlertRecord {
  id: string; // ale_<random>
  tenantId: string;
  ruleId: string;
  reportId: string;
  runId: string;
  firedAt: string;
  metric: number;
  op: AlertOp;
  threshold: number;
  notified: boolean;
  deliveries?: Array<{ to: string; sent: boolean; error?: string }>;
}
export type DashboardOp =
  | "createDashboard" | "updateDashboard" | "deleteDashboard"
  | "createReport" | "updateReport" | "deleteReport" | "runReport"
  | "createSchedule" | "updateSchedule" | "activateSchedule" | "archiveSchedule" | "deleteSchedule"
  | "createAlertRule" | "updateAlertRule" | "deleteAlertRule";
export interface PendingDashboardWrite {
  id: string; // pdw_<random>
  tenantId: string;
  op: DashboardOp;
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { reportId?: string; runId?: string; status?: string; error?: string };
  error?: string;
}
// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_DASHBOARDS_PER_TENANT = 25;
export const MAX_REPORTS_PER_TENANT = 50;
export const MAX_SCHEDULES_PER_TENANT = 25;
export const MAX_ALERT_RULES_PER_TENANT = 25;
export const MAX_DASHBOARD_WIDGETS = 20;
export const MAX_REPORT_ROWS = 1000;
export const MAX_NAME = 120;
export const MAX_DESCRIPTION = 500;
export const MAX_SCHEDULE_RECIPIENTS = 10;
export const MAX_ALERT_RECIPIENTS = 10;
export const MAX_PENDING_DASHBOARD_WRITES = 20;
export const MAX_RUNS_PER_TENANT = 200; // retention trim (first-in evicted)
export const MAX_ALERTS_PER_TENANT = 200; // retention trim
export const MAX_ARTIFACT_BASE64_BYTES = 1024 * 1024; // ≤~750KB raw (512KB+PDF headroom)
export const FIELD_KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const TIME_UTC_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_DASHBOARD_KEY = "native_dashboards.json";
export const NATIVE_DASHBOARD_REPORTS_KEY = "native_dashboard_reports.json";
export const NATIVE_DASHBOARD_SCHEDULES_KEY = "native_dashboard_schedules.json";
export const NATIVE_DASHBOARD_ALERT_RULES_KEY = "native_dashboard_alert_rules.json";
export const NATIVE_DASHBOARD_RUNS_KEY = "native_dashboard_runs.json";
export const NATIVE_DASHBOARD_ALERT_RECORDS_KEY = "native_dashboard_alert_records.json";
export const NATIVE_DASHBOARD_PENDING_KEY = "native_dashboard_pending.json";
export const NATIVE_DASHBOARD_AUDIT_KEY = "native_dashboard_audit.json";