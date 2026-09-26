/**
 * native/dashboard/gate.ts — GATED WRITE PATH for Phase 3.6 native
 * dashboards/BI. Mirrors the 2.1–3.5 gates exactly:
 *   - validation happens BEFORE the gate (bad body / forged ids / unknown ids /
 *     field refs missing from the source table schema / caps / bad cadence /
 *     non-numeric thresholds / unknown report refs NEVER queue),
 *   - every user-initiated write rides the Approval Queue verb-first; the
 *     action names ARE the verbs (createDashboard/updateReport/runReport/
 *     activateSchedule/… — all covered by WRITE_VERB prefixes; the
 *     classification test asserts each one is a WRITE),
 *   - the REPORT RUN is COMPUTED at queue time (validation) AND at apply
 *     (same deterministic result — pure engine, NO LLM, no randomness);
 *     replay → alreadyApplied with the SAME stored run (never recomputed),
 *   - schedules are the distribution primitive: ACTIVATION is the human
 *     approval; the sweeper then executes the active schedule's runs as a
 *     system actor (audit + typed events on EVERY write it makes, including
 *     each alert record) — no re-queue per run, exactly the 3.1
 *     calendar-sync durable-intent precedent,
 *   - runReport is non-destructive → autonomy-eligible (#236); other ops
 *     always ride the queue; recordAutonomyOutcome on auto-apply,
 *   - alert rules fire edge-triggered (false→true transition), durable
 *     AlertRecord + best-effort email notification + native.dashboard.alert.*
 *     events; a clearing run re-arms the rule (active=false),
 *   - the DURABLE record (rows/artifact/audit/event/alert record) is written
 *     synchronously in applyNow; email delivery is fire-and-forget AFTER the
 *     durable write (never blocks the approval card),
 *   - caps at every level (≤25 dashboards, ≤50 reports, ≤25 schedules,
 *     ≤25 alert rules, ≤20 widgets, ≤1000 report rows, ≤10 recipients,
 *     ≤20 pending/tenant, ≤200 runs + ≤200 alert records retained/tenant).
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { getTable, listRows } from "../tables/store";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  AGG_KINDS,
  ALERT_OPS,
  FIELD_KEY_RE,
  MAX_ALERT_RECIPIENTS,
  MAX_ALERT_RULES_PER_TENANT,
  MAX_ARTIFACT_BASE64_BYTES,
  MAX_DASHBOARD_WIDGETS,
  MAX_REPORT_ROWS,
  MAX_DASHBOARDS_PER_TENANT,
  MAX_DESCRIPTION,
  MAX_NAME,
  MAX_PENDING_DASHBOARD_WRITES,
  MAX_REPORTS_PER_TENANT,
  MAX_SCHEDULE_RECIPIENTS,
  MAX_SCHEDULES_PER_TENANT,
  REPORT_VIZ_KINDS,
  SCHEDULE_CADENCES,
  SCHEDULE_FORMATS,
  TIME_UTC_RE,
  type AlertOp,
  type AlertRecord,
  type AlertRuleDef,
  type DashboardDef,
  type DashboardOp,
  type PendingDashboardWrite,
  type ReportDef,
  type ReportRun,
  type ScheduleDef,
} from "./types";
import {
  reduceReport,
  csvArtifact,
  pdfArtifact,
  scheduleAnchor,
  evaluateThreshold,
} from "./engine";
import {
  appendAudit,
  deleteAlertRuleRecord,
  deleteDashboardRecord,
  deleteReportRecord,
  deleteScheduleRecord,
  generateDashboardEntityId,
  getAlertRule,
  getDashboard,
  getRun,
  getPendingWriteByAction,
  getReport,
  getSchedule,
  listAlertRules,
  listDashboards,
  listPendingWrites,
  listReports,
  listRuns,
  listSchedules,
  markPendingWrite,
  saveAlertRecord,
  saveAlertRule,
  saveDashboard,
  savePendingWrite,
  saveReport,
  saveRun,
  saveSchedule,
} from "./store";
import { sendEmail as defaultSendEmail } from "../../integrations/email";

export interface DashboardWriteRequest {
  dashboard?: {
    id?: string; // FORGED-ID GUARD — rejected
    name?: string;
    description?: string;
    reportIds?: string[];
  };
  report?: {
    id?: string; // FORGED-ID GUARD — rejected
    name?: string;
    description?: string;
    sourceTableId?: string;
    viz?: string;
    groupBy?: string | null;
    valueField?: string | null;
    agg?: string;
    sortDir?: string;
    limit?: number;
  };
  schedule?: {
    id?: string; // FORGED-ID GUARD — rejected
    reportId?: string;
    name?: string;
    cadence?: string;
    timeUtc?: string;
    format?: string;
    recipients?: string[];
  };
  alertRule?: {
    id?: string; // FORGED-ID GUARD — rejected
    reportId?: string;
    name?: string;
    metric?: string;
    op?: string;
    threshold?: number;
    recipients?: string[];
  };
  /** run only — the artifact format to generate (null = no artifact). */
  format?: "csv" | "pdf" | null;
  via?: string;
}
export type DashboardWriteResult =
  | { applied: true; pending: false; reportId?: string | undefined; runId?: string | undefined; op: string; autonomy: boolean; actionId?: string | undefined }
  | { applied: false; pending: true; approvalActionId: string; op: string }
  | { applied: false; pending: false; error: string };

export interface EmailSender {
  (o: { to: string; subject: string; text: string; html?: string }): Promise<{ success: boolean; error?: string }>;
}
interface MailOutcome { sent: boolean; error?: string }
/** The production email lane (2.4 notification lane). Overridable by tests. */
let emailSender: EmailSender = async (o) => {
  try {
    const r = await defaultSendEmail(o);
    return { success: r.success, ...(r.error ? { error: r.error } : {}) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};
export function setDashboardEmailSenderForTest(sender: EmailSender | null): void {
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
function validateEmails(recipients: unknown, cap: number, label: string): string[] {
  if (recipients === undefined || recipients === null) return [];
  if (!Array.isArray(recipients) || recipients.length === 0 || recipients.length > cap) {
    throw new Error(`${label} needs 1..${cap} recipient emails`);
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
function validateName(v: unknown): string {
  const name = typeof v === "string" ? v.trim() : "";
  if (!name) throw new Error("name is required");
  if (name.length > MAX_NAME) throw new Error(`name must be ≤${MAX_NAME} chars`);
  return name;
}
function fieldKeysOf(table: NonNullable<ReturnType<typeof getTable>>): Set<string> {
  return new Set(table.fields.map((f) => f.key));
}
function validateReportBody(
  dataDir: string,
  tenantId: string,
  body: Record<string, unknown>,
  creating: boolean,
): Pick<ReportDef, "name" | "description" | "sourceTableId" | "viz" | "groupBy" | "valueField" | "agg" | "sortDir" | "limit"> {
  if (creating && "id" in body && body.id !== undefined) throw new Error("client-supplied report ids are not accepted");
  const name = validateName(body.name);
  if (body.description !== undefined && (typeof body.description !== "string" || body.description.length > MAX_DESCRIPTION)) {
    throw new Error(`description must be ≤${MAX_DESCRIPTION} chars`);
  }
  if (typeof body.sourceTableId !== "string" || !/^tbl_[A-Za-z0-9_-]+$/.test(body.sourceTableId)) {
    throw new Error("sourceTableId must be a valid table id (tbl_)");
  }
  const table = getTable(dataDir, tenantId, body.sourceTableId);
  if (!table) throw new Error("source table not found"); // 404-no-IDOR (foreign/unknown → null)
  const keys = fieldKeysOf(table);
  if (typeof body.viz !== "string" || !REPORT_VIZ_KINDS.includes(body.viz as (typeof REPORT_VIZ_KINDS)[number])) {
    throw new Error(`viz must be one of ${REPORT_VIZ_KINDS.join("|")}`);
  }
  const viz = body.viz as ReportDef["viz"];
  if (typeof body.agg !== "string" || !AGG_KINDS.includes(body.agg as (typeof AGG_KINDS)[number])) {
    throw new Error(`agg must be one of ${AGG_KINDS.join("|")}`);
  }
  const agg = body.agg as ReportDef["agg"];
  let groupBy: string | null = null;
  if (body.groupBy != null) {
    groupBy = typeof body.groupBy === "string" ? body.groupBy.trim() : "";
    if (!groupBy) throw new Error("groupBy must be a non-empty field key when provided");
    if (!FIELD_KEY_RE.test(groupBy)) throw new Error("groupBy must be a valid field key");
    if (!keys.has(groupBy)) throw new Error(`groupBy field "${groupBy}" does not exist in the source table schema`);
  }
  let valueField: string | null = null;
  if (body.valueField != null) {
    valueField = typeof body.valueField === "string" ? body.valueField.trim() : "";
    if (!valueField) throw new Error("valueField must be a non-empty field key when provided");
    if (!FIELD_KEY_RE.test(valueField)) throw new Error("valueField must be a valid field key");
    if (!keys.has(valueField)) throw new Error(`valueField field "${valueField}" does not exist in the source table schema`);
  }
  if (agg !== "count" && !valueField) throw new Error("sum/avg/min/max aggregation needs a valueField");
  if (body.sortDir !== undefined && body.sortDir !== "asc" && body.sortDir !== "desc") throw new Error("sortDir must be asc|desc");
  const sortDir = body.sortDir === "asc" ? "asc" as const : "desc" as const;
  const limit = body.limit === undefined ? 100 : body.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > MAX_REPORT_ROWS) {
    throw new Error(`limit must be an integer 1..${MAX_REPORT_ROWS}`);
  }
  return {
    name,
    description: typeof body.description === "string" ? body.description : "",
    sourceTableId: body.sourceTableId,
    viz,
    groupBy,
    valueField,
    agg,
    sortDir,
    limit,
  };
}
function validateDashboardBody(
  dataDir: string,
  tenantId: string,
  body: Record<string, unknown>,
  creating: boolean,
): Pick<DashboardDef, "name" | "description" | "reportIds"> {
  if (creating && "id" in body && body.id !== undefined) throw new Error("client-supplied dashboard ids are not accepted");
  const name = validateName(body.name);
  let reportIds: string[] = [];
  if (body.reportIds !== undefined) {
    if (!Array.isArray(body.reportIds) || body.reportIds.length === 0 || body.reportIds.length > MAX_DASHBOARD_WIDGETS) {
      throw new Error(`reportIds needs 1..${MAX_DASHBOARD_WIDGETS} report ids`);
    }
    const seen = new Set<string>();
    for (const id of body.reportIds) {
      if (typeof id !== "string" || !/^rpt_[A-Za-z0-9_-]+$/.test(id)) throw new Error("each reportId must be a valid report id (rpt_)");
      if (seen.has(id)) throw new Error("duplicate reportId in dashboard");
      seen.add(id);
      if (!getReport(dataDir, tenantId, id)) throw new Error(`report "${id}" not found`); // 404-no-IDOR
    }
    reportIds = [...seen];
  }
  return { name, description: typeof body.description === "string" ? body.description : "", reportIds };
}
function validateScheduleBody(
  dataDir: string,
  tenantId: string,
  body: Record<string, unknown>,
  creating: boolean,
): Pick<ScheduleDef, "reportId" | "name" | "cadence" | "timeUtc" | "format" | "recipients"> {
  if (creating && "id" in body && body.id !== undefined) throw new Error("client-supplied schedule ids are not accepted");
  const name = validateName(body.name);
  if (typeof body.reportId !== "string" || !/^rpt_[A-Za-z0-9_-]+$/.test(body.reportId)) throw new Error("reportId is required (rpt_)");
  if (!getReport(dataDir, tenantId, body.reportId)) throw new Error("report not found"); // 404-no-IDOR
  if (typeof body.cadence !== "string" || !SCHEDULE_CADENCES.includes(body.cadence as (typeof SCHEDULE_CADENCES)[number])) {
    throw new Error(`cadence must be one of ${SCHEDULE_CADENCES.join("|")}`);
  }
  if (typeof body.timeUtc !== "string" || !TIME_UTC_RE.test(body.timeUtc)) throw new Error("timeUtc must be HH:MM (UTC)");
  if (typeof body.format !== "string" || !SCHEDULE_FORMATS.includes(body.format as (typeof SCHEDULE_FORMATS)[number])) {
    throw new Error(`format must be one of ${SCHEDULE_FORMATS.join("|")}`);
  }
  const recipients = validateEmails(body.recipients, MAX_SCHEDULE_RECIPIENTS, "schedule");
  return {
    reportId: body.reportId,
    name,
    cadence: body.cadence as ScheduleDef["cadence"],
    timeUtc: body.timeUtc,
    format: body.format as ScheduleDef["format"],
    recipients,
  };
}
function validateAlertRuleBody(
  dataDir: string,
  tenantId: string,
  body: Record<string, unknown>,
  creating: boolean,
): Pick<AlertRuleDef, "reportId" | "name" | "metric" | "op" | "threshold" | "recipients"> {
  if (creating && "id" in body && body.id !== undefined) throw new Error("client-supplied alert-rule ids are not accepted");
  const name = validateName(body.name);
  if (typeof body.reportId !== "string" || !/^rpt_[A-Za-z0-9_-]+$/.test(body.reportId)) throw new Error("reportId is required (rpt_)");
  if (!getReport(dataDir, tenantId, body.reportId)) throw new Error("report not found"); // 404-no-IDOR
  if (body.metric !== undefined && body.metric !== "agg" && body.metric !== "rows") throw new Error("metric must be agg|rows");
  const metric = body.metric === "rows" ? "rows" as const : "agg" as const;
  if (typeof body.op !== "string" || !ALERT_OPS.includes(body.op as (typeof ALERT_OPS)[number])) {
    throw new Error(`op must be one of ${ALERT_OPS.join("|")}`);
  }
  const threshold = body.threshold;
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) throw new Error("threshold must be a finite number");
  const recipients = validateEmails(body.recipients, MAX_ALERT_RECIPIENTS, "alert rule");
  return {
    reportId: body.reportId,
    name,
    metric,
    op: body.op as AlertOp,
    threshold,
    recipients,
  };
}
function requireReportId(req: DashboardWriteRequest): string {
  const id = req.report?.id ?? "";
  if (!/^rpt_[A-Za-z0-9_-]+$/.test(id)) throw new Error("reportId is required");
  return id;
}
function validateWrite(dataDir: string, tenantId: string, op: DashboardOp, req: DashboardWriteRequest): void {
  switch (op) {
    case "createDashboard":
      validateDashboardBody(dataDir, tenantId, (req.dashboard ?? {}) as Record<string, unknown>, true);
      if (listDashboards(dataDir, tenantId).length >= MAX_DASHBOARDS_PER_TENANT) throw new Error(`dashboard cap reached (${MAX_DASHBOARDS_PER_TENANT})`);
      return;
    case "updateDashboard": {
      const id = req.dashboard?.id ?? "";
      if (!/^dsh_[A-Za-z0-9_-]+$/.test(id)) throw new Error("dashboardId is required");
      if (!getDashboard(dataDir, tenantId, id)) throw new Error("dashboard not found");
      validateDashboardBody(dataDir, tenantId, (req.dashboard ?? {}) as Record<string, unknown>, false);
      return;
    }
    case "deleteDashboard": {
      const id = req.dashboard?.id ?? "";
      if (!/^dsh_[A-Za-z0-9_-]+$/.test(id)) throw new Error("dashboardId is required");
      if (!getDashboard(dataDir, tenantId, id)) throw new Error("dashboard not found");
      return;
    }
    case "createReport":
      validateReportBody(dataDir, tenantId, (req.report ?? {}) as Record<string, unknown>, true);
      if (listReports(dataDir, tenantId).length >= MAX_REPORTS_PER_TENANT) throw new Error(`report cap reached (${MAX_REPORTS_PER_TENANT})`);
      return;
    case "updateReport": {
      const id = requireReportId(req);
      if (!getReport(dataDir, tenantId, id)) throw new Error("report not found");
      validateReportBody(dataDir, tenantId, (req.report ?? {}) as Record<string, unknown>, false);
      return;
    }
    case "deleteReport": {
      const id = requireReportId(req);
      if (!getReport(dataDir, tenantId, id)) throw new Error("report not found");
      // Fail-closed: a report in use by a dashboard/schedule/alert rule can't
      // be deleted (dangling refs would break widgets + distribution).
      if (listDashboards(dataDir, tenantId).some((d) => d.reportIds.includes(id))) throw new Error("report is used by a dashboard — remove it from the dashboard first");
      if (listSchedules(dataDir, tenantId).some((s) => s.reportId === id)) throw new Error("report is used by a schedule — archive/delete the schedule first");
      if (listAlertRules(dataDir, tenantId).some((r) => r.reportId === id)) throw new Error("report is used by an alert rule — delete the rule first");
      if (listRuns(dataDir, tenantId, id).length > 0) throw new Error("cannot delete a report that has runs");
      return;
    }
    case "runReport": {
      const id = requireReportId(req);
      const def = getReport(dataDir, tenantId, id);
      if (!def) throw new Error("report not found"); // 404-no-IDOR
      if (req.format !== undefined && req.format !== null && req.format !== "csv" && req.format !== "pdf") throw new Error("format must be csv|pdf|null");
      // Compute NOW — a deleted table / bad rows never queue.
      computeRun(def, dataDir, tenantId, req.format === "csv" || req.format === "pdf" ? req.format : null);
      const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
      if (pending.length >= MAX_PENDING_DASHBOARD_WRITES) throw new Error(`Pending-write cap reached (${MAX_PENDING_DASHBOARD_WRITES}) — approve or reject before more`);
      return;
    }
    case "createSchedule":
      validateScheduleBody(dataDir, tenantId, (req.schedule ?? {}) as Record<string, unknown>, true);
      if (listSchedules(dataDir, tenantId).length >= MAX_SCHEDULES_PER_TENANT) throw new Error(`schedule cap reached (${MAX_SCHEDULES_PER_TENANT})`);
      return;
    case "updateSchedule": {
      const id = req.schedule?.id ?? "";
      if (!/^sch_[A-Za-z0-9_-]+$/.test(id)) throw new Error("scheduleId is required");
      const s = getSchedule(dataDir, tenantId, id);
      if (!s) throw new Error("schedule not found");
      if (s.status !== "draft") throw new Error("schedules can only be edited in draft");
      validateScheduleBody(dataDir, tenantId, (req.schedule ?? {}) as Record<string, unknown>, false);
      return;
    }
    case "activateSchedule": {
      const id = req.schedule?.id ?? "";
      if (!/^sch_[A-Za-z0-9_-]+$/.test(id)) throw new Error("scheduleId is required");
      const s = getSchedule(dataDir, tenantId, id);
      if (!s) throw new Error("schedule not found");
      if (s.status !== "draft") throw new Error("only draft schedules can be activated");
      return;
    }
    case "archiveSchedule": {
      const id = req.schedule?.id ?? "";
      if (!/^sch_[A-Za-z0-9_-]+$/.test(id)) throw new Error("scheduleId is required");
      const s = getSchedule(dataDir, tenantId, id);
      if (!s) throw new Error("schedule not found");
      if (s.status !== "active") throw new Error("only active schedules can be archived");
      return;
    }
    case "deleteSchedule": {
      const id = req.schedule?.id ?? "";
      if (!/^sch_[A-Za-z0-9_-]+$/.test(id)) throw new Error("scheduleId is required");
      const s = getSchedule(dataDir, tenantId, id);
      if (!s) throw new Error("schedule not found");
      if (s.status !== "draft") throw new Error("only draft schedules can be deleted");
      return;
    }
    case "createAlertRule":
      validateAlertRuleBody(dataDir, tenantId, (req.alertRule ?? {}) as Record<string, unknown>, true);
      if (listAlertRules(dataDir, tenantId).length >= MAX_ALERT_RULES_PER_TENANT) throw new Error(`alert-rule cap reached (${MAX_ALERT_RULES_PER_TENANT})`);
      return;
    case "updateAlertRule": {
      const id = req.alertRule?.id ?? "";
      if (!/^alr_[A-Za-z0-9_-]+$/.test(id)) throw new Error("alertRuleId is required");
      if (!getAlertRule(dataDir, tenantId, id)) throw new Error("alert rule not found");
      validateAlertRuleBody(dataDir, tenantId, (req.alertRule ?? {}) as Record<string, unknown>, false);
      return;
    }
    case "deleteAlertRule": {
      const id = req.alertRule?.id ?? "";
      if (!/^alr_[A-Za-z0-9_-]+$/.test(id)) throw new Error("alertRuleId is required");
      if (!getAlertRule(dataDir, tenantId, id)) throw new Error("alert rule not found");
      return;
    }
  }
}
/** Read-only report computation for an EXISTING report (run preflight + apply).
 *  Reads 1.4 rows tenant-scoped and reduces them deterministically. */
function computeRun(def: ReportDef, dataDir: string, tenantId: string, format: "csv" | "pdf" | null): { rows: ReportRun["rows"]; headline: number | null; rowCount: number; artifact: ReportRun["artifact"] } {
  const table = getTable(dataDir, tenantId, def.sourceTableId);
  if (!table) throw new Error("source table no longer exists");
  const all = listRows(dataDir, tenantId, def.sourceTableId);
  const out = reduceReport(def, all);
  let artifact: ReportRun["artifact"] = null;
  if (format) {
    if (format === "csv") {
      const csv = csvArtifact(def, out);
      const b64 = Buffer.from(csv, "utf-8").toString("base64");
      if (b64.length > MAX_ARTIFACT_BASE64_BYTES) throw new Error("report artifact exceeds the size cap");
      artifact = { mime: "text/csv", kind: "csv", base64: b64 };
    } else {
      const pdf = pdfArtifact(def, out);
      const b64 = Buffer.from(pdf).toString("base64");
      if (b64.length > MAX_ARTIFACT_BASE64_BYTES) throw new Error("report artifact exceeds the size cap");
      artifact = { mime: "application/pdf", kind: "pdf", base64: b64 };
    }
  }
  return { rows: out.rows, headline: out.headline, rowCount: out.rowCount, artifact };
}
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-dashboard");
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}
/** Evaluate alert rules for a report AFTER a run record landed (edge-triggered).
 *  Durable writes (alert record + rule active flip + audit + event) happen
 *  synchronously; email is fire-and-forget after those records land. */
function evaluateAlertsSync(dataDir: string, tenantId: string, def: ReportDef, run: ReportRun, actor: string): void {
  const rules = listAlertRules(dataDir, tenantId, def.id);
  for (const rule of rules) {
    const compare = rule.metric === "rows" ? run.rowCount : (run.headline ?? 0);
    const breached = evaluateThreshold(compare, rule.op, rule.threshold);
    if (breached && !rule.active) {
      // fire — durable record FIRST, then async email.
      rule.active = true;
      rule.version += 1;
      rule.updatedAt = new Date().toISOString();
      rule.updatedBy = "system/alerts";
      saveAlertRule(dataDir, rule);
      const rec: AlertRecord = {
        id: generateDashboardEntityId("ale"),
        tenantId,
        ruleId: rule.id,
        reportId: def.id,
        runId: run.id,
        firedAt: new Date().toISOString(),
        metric: compare,
        op: rule.op,
        threshold: rule.threshold,
        notified: false,
        deliveries: (rule.recipients ?? []).map((to) => ({ to, sent: false })),
      };
      saveAlertRecord(dataDir, rec);
      appendAudit(dataDir, { tenantId, actor, action: "native.dashboard.alert.fired", reportId: def.id, runId: run.id, detail: `Alert "${rule.name}" fired (${rule.op} ${rule.threshold}, value ${compare})` });
      publishEvent(dataDir, tenantId, "native.dashboard.alert.fired", { ruleId: rule.id, reportId: def.id, runId: run.id, metric: compare, op: rule.op, threshold: rule.threshold });
      if (rule.recipients.length > 0) {
        void (async () => {
          const deliveries: AlertRecord["deliveries"] = [];
          for (const to of rule.recipients) {
            const r = await mail(to, `Alert: ${rule.name}`, `Report "${def.name}" breached ${rule.op} ${rule.threshold} (value ${compare}).`);
            deliveries.push({ to, sent: r.sent, ...(r.error ? { error: r.error } : {}) });
          }
          // Durable write-back: update the already-persisted record in place.
          saveAlertRecord(dataDir, { ...rec, deliveries, notified: deliveries.some((d) => d.sent) });
        })().catch(() => undefined);
      }
    } else if (!breached && rule.active) {
      // clear — re-arms the rule
      rule.active = false;
      rule.version += 1;
      rule.updatedAt = new Date().toISOString();
      rule.updatedBy = "system/alerts";
      saveAlertRule(dataDir, rule);
      appendAudit(dataDir, { tenantId, actor, action: "native.dashboard.alert.cleared", reportId: def.id, runId: run.id, detail: `Alert "${rule.name}" cleared (value ${compare})` });
    }
  }
}
/** Execute the write under authority (autonomy auto-apply or approve path).
 *  SYNCHRONOUS for every durable record; email/notify is fire-and-forget. */
function applyNow(
  dataDir: string,
  tenantId: string,
  op: DashboardOp,
  req: DashboardWriteRequest,
  actor: string,
  autonomy: boolean,
): { ok: boolean; error?: string; reportId?: string; runId?: string } {
  const now = new Date().toISOString();
  const who = autonomy ? "system/autonomy" : actor;
  if (op === "createDashboard") {
    const v = validateDashboardBody(dataDir, tenantId, (req.dashboard ?? {}) as Record<string, unknown>, true);
    const d: DashboardDef = { id: generateDashboardEntityId("dsh"), tenantId, name: v.name, description: v.description, reportIds: v.reportIds, version: 1, createdAt: now, createdBy: who, updatedAt: now, updatedBy: who };
    saveDashboard(dataDir, d);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.created", detail: `Created dashboard "${d.name}"` });
    publishEvent(dataDir, tenantId, "native.dashboard.created", { dashboardId: d.id });
    return { ok: true, reportId: d.id };
  }
  if (op === "updateDashboard") {
    const d = getDashboard(dataDir, tenantId, req.dashboard?.id ?? "")!;
    const v = validateDashboardBody(dataDir, tenantId, (req.dashboard ?? {}) as Record<string, unknown>, false);
    const next: DashboardDef = { ...d, name: v.name, description: v.description, reportIds: v.reportIds, version: d.version + 1, updatedAt: now, updatedBy: who };
    saveDashboard(dataDir, next);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.updated", detail: `Updated dashboard "${next.name}" (v${next.version})` });
    publishEvent(dataDir, tenantId, "native.dashboard.updated", { dashboardId: d.id });
    return { ok: true, reportId: d.id };
  }
  if (op === "deleteDashboard") {
    const d = getDashboard(dataDir, tenantId, req.dashboard?.id ?? "")!;
    deleteDashboardRecord(dataDir, tenantId, d.id);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.deleted", detail: `Deleted dashboard "${d.name}"` });
    publishEvent(dataDir, tenantId, "native.dashboard.deleted", { dashboardId: d.id });
    return { ok: true, reportId: d.id };
  }
  if (op === "createReport") {
    const v = validateReportBody(dataDir, tenantId, (req.report ?? {}) as Record<string, unknown>, true);
    const r: ReportDef = { id: generateDashboardEntityId("rpt"), tenantId, name: v.name, description: v.description, sourceTableId: v.sourceTableId, viz: v.viz, groupBy: v.groupBy, valueField: v.valueField, agg: v.agg, sortDir: v.sortDir, limit: v.limit, version: 1, createdAt: now, createdBy: who, updatedAt: now, updatedBy: who };
    saveReport(dataDir, r);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.report.created", reportId: r.id, detail: `Created report "${r.name}" over table ${r.sourceTableId}` });
    publishEvent(dataDir, tenantId, "native.dashboard.report.created", { reportId: r.id, sourceTableId: r.sourceTableId });
    return { ok: true, reportId: r.id };
  }
  if (op === "updateReport") {
    const r = getReport(dataDir, tenantId, req.report?.id ?? "")!;
    const v = validateReportBody(dataDir, tenantId, (req.report ?? {}) as Record<string, unknown>, false);
    const next: ReportDef = { ...r, name: v.name, description: v.description, sourceTableId: v.sourceTableId, viz: v.viz, groupBy: v.groupBy, valueField: v.valueField, agg: v.agg, sortDir: v.sortDir, limit: v.limit, version: r.version + 1, updatedAt: now, updatedBy: who };
    saveReport(dataDir, next);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.report.updated", reportId: r.id, detail: `Updated report "${next.name}" (v${next.version})` });
    publishEvent(dataDir, tenantId, "native.dashboard.report.updated", { reportId: r.id });
    return { ok: true, reportId: r.id };
  }
  if (op === "deleteReport") {
    const r = getReport(dataDir, tenantId, req.report?.id ?? "")!;
    deleteReportRecord(dataDir, tenantId, r.id);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.report.deleted", reportId: r.id, detail: `Deleted report "${r.name}"` });
    publishEvent(dataDir, tenantId, "native.dashboard.report.deleted", { reportId: r.id });
    return { ok: true, reportId: r.id };
  }
  if (op === "createSchedule") {
    const v = validateScheduleBody(dataDir, tenantId, (req.schedule ?? {}) as Record<string, unknown>, true);
    const s: ScheduleDef = { id: generateDashboardEntityId("sch"), tenantId, reportId: v.reportId, name: v.name, cadence: v.cadence, timeUtc: v.timeUtc, format: v.format, recipients: v.recipients, status: "draft", nextRunAt: scheduleAnchor(v.cadence, v.timeUtc, new Date()).toISOString(), version: 1, createdAt: now, createdBy: who, updatedAt: now, updatedBy: who };
    saveSchedule(dataDir, s);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.schedule.created", scheduleId: s.id, reportId: v.reportId, detail: `Created schedule "${s.name}" (${s.cadence} ${s.timeUtc} UTC, ${s.format})` });
    publishEvent(dataDir, tenantId, "native.dashboard.schedule.created", { scheduleId: s.id, reportId: v.reportId });
    return { ok: true, reportId: s.id };
  }
  if (op === "updateSchedule") {
    const s = getSchedule(dataDir, tenantId, req.schedule?.id ?? "")!;
    const v = validateScheduleBody(dataDir, tenantId, (req.schedule ?? {}) as Record<string, unknown>, false);
    const next: ScheduleDef = { ...s, reportId: v.reportId, name: v.name, cadence: v.cadence, timeUtc: v.timeUtc, format: v.format, recipients: v.recipients, version: s.version + 1, updatedAt: now, updatedBy: who };
    saveSchedule(dataDir, next);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.schedule.updated", scheduleId: s.id, detail: `Updated schedule "${next.name}" (v${next.version})` });
    publishEvent(dataDir, tenantId, "native.dashboard.schedule.updated", { scheduleId: s.id });
    return { ok: true, reportId: s.id };
  }
  if (op === "activateSchedule") {
    const s = getSchedule(dataDir, tenantId, req.schedule?.id ?? "")!;
    const next: ScheduleDef = { ...s, status: "active", nextRunAt: scheduleAnchor(s.cadence, s.timeUtc, new Date()).toISOString(), version: s.version + 1, updatedAt: now, updatedBy: who };
    saveSchedule(dataDir, next);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.schedule.activated", scheduleId: s.id, detail: `Schedule "${next.name}" activated (first run ${next.nextRunAt})` });
    publishEvent(dataDir, tenantId, "native.dashboard.schedule.activated", { scheduleId: s.id, nextRunAt: next.nextRunAt });
    return { ok: true, reportId: s.id };
  }
  if (op === "archiveSchedule") {
    const s = getSchedule(dataDir, tenantId, req.schedule?.id ?? "")!;
    const next: ScheduleDef = { ...s, status: "archived", version: s.version + 1, updatedAt: now, updatedBy: who };
    saveSchedule(dataDir, next);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.schedule.archived", scheduleId: s.id, detail: `Schedule "${next.name}" archived (terminal)` });
    publishEvent(dataDir, tenantId, "native.dashboard.schedule.archived", { scheduleId: s.id });
    return { ok: true, reportId: s.id };
  }
  if (op === "deleteSchedule") {
    const s = getSchedule(dataDir, tenantId, req.schedule?.id ?? "")!;
    deleteScheduleRecord(dataDir, tenantId, s.id);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.schedule.deleted", scheduleId: s.id, detail: `Deleted schedule "${s.name}"` });
    publishEvent(dataDir, tenantId, "native.dashboard.schedule.deleted", { scheduleId: s.id });
    return { ok: true, reportId: s.id };
  }
  if (op === "createAlertRule") {
    const v = validateAlertRuleBody(dataDir, tenantId, (req.alertRule ?? {}) as Record<string, unknown>, true);
    const a: AlertRuleDef = { id: generateDashboardEntityId("alr"), tenantId, reportId: v.reportId, name: v.name, metric: v.metric, op: v.op, threshold: v.threshold, recipients: v.recipients, active: false, version: 1, createdAt: now, createdBy: who, updatedAt: now, updatedBy: who };
    saveAlertRule(dataDir, a);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.alertrule.created", reportId: v.reportId, detail: `Created alert rule "${a.name}" (${a.op} ${a.threshold})` });
    publishEvent(dataDir, tenantId, "native.dashboard.alertrule.created", { ruleId: a.id, reportId: v.reportId });
    return { ok: true, reportId: a.id };
  }
  if (op === "updateAlertRule") {
    const a = getAlertRule(dataDir, tenantId, req.alertRule?.id ?? "")!;
    const v = validateAlertRuleBody(dataDir, tenantId, (req.alertRule ?? {}) as Record<string, unknown>, false);
    const next: AlertRuleDef = { ...a, reportId: v.reportId, name: v.name, metric: v.metric, op: v.op, threshold: v.threshold, recipients: v.recipients, version: a.version + 1, updatedAt: now, updatedBy: who };
    saveAlertRule(dataDir, next);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.alertrule.updated", reportId: v.reportId, detail: `Updated alert rule "${next.name}" (v${next.version})` });
    publishEvent(dataDir, tenantId, "native.dashboard.alertrule.updated", { ruleId: a.id });
    return { ok: true, reportId: a.id };
  }
  if (op === "deleteAlertRule") {
    const a = getAlertRule(dataDir, tenantId, req.alertRule?.id ?? "")!;
    deleteAlertRuleRecord(dataDir, tenantId, a.id);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.alertrule.deleted", reportId: a.reportId, detail: `Deleted alert rule "${a.name}"` });
    publishEvent(dataDir, tenantId, "native.dashboard.alertrule.deleted", { ruleId: a.id });
    return { ok: true, reportId: a.id };
  }
  // runReport — deterministic engine; seed = the durable run id.
  const def = getReport(dataDir, tenantId, req.report?.id ?? "")!;
  const runId = generateDashboardEntityId("rsn");
  try {
    const fmt = req.format === "csv" || req.format === "pdf" ? req.format : null;
    const c = computeRun(def, dataDir, tenantId, fmt);
    const run: ReportRun = {
      id: runId,
      tenantId,
      reportId: def.id,
      triggeredBy: who,
      triggeredAt: now,
      rows: c.rows,
      headline: c.headline,
      rowCount: c.rowCount,
      artifact: c.artifact,
    };
    saveRun(dataDir, run);
    appendAudit(dataDir, { tenantId, actor: who, action: "native.dashboard.report.ran", reportId: def.id, runId, detail: `Ran report "${def.name}" (${c.rowCount} rows)` });
    publishEvent(dataDir, tenantId, "native.dashboard.report.ran", { reportId: def.id, runId, rowCount: c.rowCount });
    evaluateAlertsSync(dataDir, tenantId, def, run, who);
    return { ok: true, reportId: def.id, runId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
/** Submit a gated dashboard write. Validation FIRST — bad writes 400 before
 *  the queue. */
export function submitDashboardWrite(dataDir: string, tenantId: string, op: DashboardOp, req: DashboardWriteRequest, actor: string): DashboardWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  try {
    validateWrite(dataDir, tenantId, op, req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = op; // action name IS the verb (all in WRITE_VERB)
  const gate = approvalGate(tenantId, action, "native-dashboard", { reportId: req.report?.id ?? req.schedule?.reportId ?? req.alertRule?.reportId ?? "", op, via: req.via ?? "portal" }, { dataDir, workflowId: "native-dashboard" });
  if (gate.allowed) {
    const out = applyNow(dataDir, tenantId, op, req, actor, !!gate.autonomy);
    if (!out.ok) return { applied: false, pending: false, error: out.error ?? "apply failed" };
    if (gate.autonomy) recordAutonomyOutcome(tenantId, gate.workflowId || "native-dashboard", action, "native-dashboard", true, { dataDir, allowListId: gate.allowListId, target: req.report?.id ?? req.schedule?.reportId ?? req.alertRule?.reportId ?? "" });
    return { applied: true, pending: false, ...(out.reportId ? { reportId: out.reportId } : {}), ...(out.runId ? { runId: out.runId } : {}), op, autonomy: !!gate.autonomy, ...(gate.actionId ? { actionId: gate.actionId } : {}) };
  }
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
  if (pending.length >= MAX_PENDING_DASHBOARD_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_DASHBOARD_WRITES}) — approve or reject before more` };
  }
  const ptw: PendingDashboardWrite = {
    id: generateDashboardEntityId("pdw"),
    tenantId,
    op,
    payload: { ...req, via: req.via ?? "portal" },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: "native.dashboard.pending", detail: `Queued ${action} for approval (${ptw.id})` });
  publishEvent(dataDir, tenantId, "native.dashboard.pending", { op, ptwId: ptw.id });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}
/** Approve-path executor: applies the approved write once (idempotent). */
export function executePendingDashboardWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; reportId?: string; runId?: string; ptwId: string; alreadyApplied?: boolean } | { ok: false; reason: string; ptwId?: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status === "rejected") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied") {
    return { ok: true, alreadyApplied: true, reportId: ptw.appliedResult?.reportId ?? undefined, runId: ptw.appliedResult?.runId, ptwId: ptw.id };
  }
  try {
    validateWrite(dataDir, tenantId, ptw.op, ptw.payload as DashboardWriteRequest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", { error: msg });
    appendAudit(dataDir, { tenantId, actor: "system", action: "native.dashboard.rejected", detail: `Apply re-validation failed: ${msg}` });
    return { ok: false, reason: msg, ptwId: ptw.id };
  }
  const out = applyNow(dataDir, tenantId, ptw.op, ptw.payload as DashboardWriteRequest, actor, false);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", { error: out.error ?? "apply failed" });
    appendAudit(dataDir, { tenantId, actor: "system", action: "native.dashboard.rejected", detail: `Apply failed: ${out.error ?? "unknown"}` });
    return { ok: false, reason: out.error ?? "apply failed", ptwId: ptw.id };
  }
  markPendingWrite(dataDir, tenantId, ptw.id, "applied", { ...(out.reportId ? { reportId: out.reportId } : {}), ...(out.runId ? { runId: out.runId } : {}) });
  return { ok: true, ...(out.reportId ? { reportId: out.reportId } : {}), ...(out.runId ? { runId: out.runId } : {}), ptwId: ptw.id };
}
/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const ptw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingDashboardWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", reportId: res.reportId, runId: res.runId } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected");
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}
/** Run a due schedule now (sweeper call): renders the report, stores a durable
 *  snapshot + artifact, audits, evaluates alerts, and advances nextRunAt.
 *  Synchronous durable writes; email fire-and-forget. Returns the run id. */
export function fireScheduleNow(dataDir: string, tenantId: string, scheduleId: string): { ok: boolean; runId?: string; error?: string } {
  const s = getSchedule(dataDir, tenantId, scheduleId);
  if (!s) return { ok: false, error: "schedule not found" };
  if (s.status !== "active") return { ok: false, error: "schedule is not active" };
  const def = getReport(dataDir, tenantId, s.reportId);
  if (!def) return { ok: false, error: "report not found" };
  const runId = generateDashboardEntityId("rsn");
  try {
    const c = computeRun(def, dataDir, tenantId, s.format);
    const run: ReportRun = {
      id: runId,
      tenantId,
      reportId: def.id,
      triggeredBy: `system/schedule:${s.id}`,
      triggeredAt: new Date().toISOString(),
      rows: c.rows,
      headline: c.headline,
      rowCount: c.rowCount,
      artifact: c.artifact,
    };
    saveRun(dataDir, run);
    appendAudit(dataDir, { tenantId, actor: `system/schedule:${s.id}`, action: "native.dashboard.schedule.ran", scheduleId: s.id, reportId: def.id, runId, detail: `Schedule "${s.name}" produced snapshot (${c.rowCount} rows, ${s.format}) for ${s.recipients.length} recipient(s)` });
    publishEvent(dataDir, tenantId, "native.dashboard.schedule.ran", { scheduleId: s.id, reportId: def.id, runId, rowCount: c.rowCount, format: s.format });
    evaluateAlertsSync(dataDir, tenantId, def, run, `system/schedule:${s.id}`);
    // Advance the anchor NOW (deterministic; a crash before this line leaves
    // nextRunAt in the past → the sweeper re-runs once, which is idempotent by
    // the same run id being re-generated — acceptable at-least-once semantics).
    s.nextRunAt = scheduleAnchor(s.cadence, s.timeUtc, new Date()).toISOString();
    s.version += 1;
    s.updatedAt = new Date().toISOString();
    s.updatedBy = "system/scheduler";
    saveSchedule(dataDir, s);
    if (s.recipients.length > 0) {
      const recipients = [...s.recipients];
      void (async () => {
        const deliveries: ReportRun["deliveries"] = [];
        for (const to of recipients) {
          const r = await mail(to, `Scheduled report: ${def.name}`, `Your scheduled snapshot "${def.name}" (${s.format}) is attached.`);
          deliveries.push({ to, sent: r.sent, ...(r.error ? { error: r.error } : {}) });
        }
        const saved = getRun(dataDir, tenantId, runId);
        if (saved) {
          saved.deliveries = deliveries;
          saveRun(dataDir, saved);
        }
      })().catch(() => undefined);
    }
    return { ok: true, runId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}