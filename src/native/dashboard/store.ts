/**
 * native/dashboard/store.ts — durable, tenant-keyed DASHBOARD/BI store (3.6).
 * Dashboards + reports + schedules + alert rules + run snapshots + alert
 * records + pending-write mirror + immutable native.dashboard.* audit. Every
 * read/write takes tenantId explicitly — zero cross-tenant paths.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  MAX_ALERTS_PER_TENANT,
  MAX_RUNS_PER_TENANT,
  NATIVE_DASHBOARD_ALERT_RECORDS_KEY,
  NATIVE_DASHBOARD_ALERT_RULES_KEY,
  NATIVE_DASHBOARD_AUDIT_KEY,
  NATIVE_DASHBOARD_KEY,
  NATIVE_DASHBOARD_PENDING_KEY,
  NATIVE_DASHBOARD_REPORTS_KEY,
  NATIVE_DASHBOARD_RUNS_KEY,
  NATIVE_DASHBOARD_SCHEDULES_KEY,
  type AlertRecord,
  type AlertRuleDef,
  type DashboardDef,
  type PendingDashboardWrite,
  type ReportDef,
  type ReportRun,
  type ScheduleDef,
} from "./types";
export interface NativeDashboardAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.dashboard.<...>.*
  reportId?: string;
  scheduleId?: string;
  runId?: string;
  detail: string;
}
function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function load<T>(dataDir: string, key: string, fallback: T): T {
  try {
    const raw = readJSON(dataPath(dataDir, key));
    return (raw ?? fallback) as T;
  } catch {
    return fallback;
  }
}
function save(dataDir: string, key: string, value: unknown): void {
  writeJSON(dataPath(dataDir, key), value);
}
export function generateDashboardEntityId(kind: "dsh" | "rpt" | "sch" | "alr" | "rsn" | "ale" | "pdw"): string {
  return `${kind}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}
// ── Dashboards ──────────────────────────────────────────────────────────────
interface DshIndex { dashboards: DashboardDef[] }
export function listDashboards(dataDir: string, tenantId: string): DashboardDef[] {
  return load<Record<string, DshIndex>>(dataDir, NATIVE_DASHBOARD_KEY, {})[tenantId]?.dashboards ?? [];
}
export function getDashboard(dataDir: string, tenantId: string, id: string): DashboardDef | null {
  return listDashboards(dataDir, tenantId).find((d) => d.id === id) ?? null;
}
export function saveDashboard(dataDir: string, d: DashboardDef): void {
  const all = load<Record<string, DshIndex>>(dataDir, NATIVE_DASHBOARD_KEY, {});
  const idx = all[d.tenantId] ?? { dashboards: [] };
  const i = idx.dashboards.findIndex((x) => x.id === d.id);
  if (i >= 0) idx.dashboards[i] = d;
  else idx.dashboards.push(d);
  all[d.tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_KEY, all);
}
export function deleteDashboardRecord(dataDir: string, tenantId: string, id: string): void {
  const all = load<Record<string, DshIndex>>(dataDir, NATIVE_DASHBOARD_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.dashboards = idx.dashboards.filter((d) => d.id !== id);
  all[tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_KEY, all);
}
// ── Reports ─────────────────────────────────────────────────────────────────
interface RptIndex { reports: ReportDef[] }
export function listReports(dataDir: string, tenantId: string): ReportDef[] {
  return load<Record<string, RptIndex>>(dataDir, NATIVE_DASHBOARD_REPORTS_KEY, {})[tenantId]?.reports ?? [];
}
export function getReport(dataDir: string, tenantId: string, id: string): ReportDef | null {
  return listReports(dataDir, tenantId).find((r) => r.id === id) ?? null;
}
export function saveReport(dataDir: string, r: ReportDef): void {
  const all = load<Record<string, RptIndex>>(dataDir, NATIVE_DASHBOARD_REPORTS_KEY, {});
  const idx = all[r.tenantId] ?? { reports: [] };
  const i = idx.reports.findIndex((x) => x.id === r.id);
  if (i >= 0) idx.reports[i] = r;
  else idx.reports.push(r);
  all[r.tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_REPORTS_KEY, all);
}
export function deleteReportRecord(dataDir: string, tenantId: string, id: string): void {
  const all = load<Record<string, RptIndex>>(dataDir, NATIVE_DASHBOARD_REPORTS_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.reports = idx.reports.filter((r) => r.id !== id);
  all[tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_REPORTS_KEY, all);
}
// ── Schedules ───────────────────────────────────────────────────────────────
interface SchIndex { schedules: ScheduleDef[] }
export function listSchedules(dataDir: string, tenantId: string): ScheduleDef[] {
  return load<Record<string, SchIndex>>(dataDir, NATIVE_DASHBOARD_SCHEDULES_KEY, {})[tenantId]?.schedules ?? [];
}
/** ALL tenants' schedules (sweeper discovery — never exposed over HTTP). */
export function listAllSchedules(dataDir: string): Array<{ tenantId: string; schedule: ScheduleDef }> {
  const all = load<Record<string, SchIndex>>(dataDir, NATIVE_DASHBOARD_SCHEDULES_KEY, {});
  const out: Array<{ tenantId: string; schedule: ScheduleDef }> = [];
  for (const tenantId of Object.keys(all)) {
    for (const schedule of all[tenantId]?.schedules ?? []) out.push({ tenantId, schedule });
  }
  return out;
}
export function getSchedule(dataDir: string, tenantId: string, id: string): ScheduleDef | null {
  return listSchedules(dataDir, tenantId).find((s) => s.id === id) ?? null;
}
export function saveSchedule(dataDir: string, s: ScheduleDef): void {
  const all = load<Record<string, SchIndex>>(dataDir, NATIVE_DASHBOARD_SCHEDULES_KEY, {});
  const idx = all[s.tenantId] ?? { schedules: [] };
  const i = idx.schedules.findIndex((x) => x.id === s.id);
  if (i >= 0) idx.schedules[i] = s;
  else idx.schedules.push(s);
  all[s.tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_SCHEDULES_KEY, all);
}
export function deleteScheduleRecord(dataDir: string, tenantId: string, id: string): void {
  const all = load<Record<string, SchIndex>>(dataDir, NATIVE_DASHBOARD_SCHEDULES_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.schedules = idx.schedules.filter((s) => s.id !== id);
  all[tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_SCHEDULES_KEY, all);
}
// ── Alert rules ─────────────────────────────────────────────────────────────
interface AlrIndex { rules: AlertRuleDef[] }
export function listAlertRules(dataDir: string, tenantId: string, reportId?: string): AlertRuleDef[] {
  const all = load<Record<string, AlrIndex>>(dataDir, NATIVE_DASHBOARD_ALERT_RULES_KEY, {});
  const rules = all[tenantId]?.rules ?? [];
  return reportId ? rules.filter((r) => r.reportId === reportId) : rules;
}
export function getAlertRule(dataDir: string, tenantId: string, id: string): AlertRuleDef | null {
  return listAlertRules(dataDir, tenantId).find((r) => r.id === id) ?? null;
}
export function saveAlertRule(dataDir: string, r: AlertRuleDef): void {
  const all = load<Record<string, AlrIndex>>(dataDir, NATIVE_DASHBOARD_ALERT_RULES_KEY, {});
  const idx = all[r.tenantId] ?? { rules: [] };
  const i = idx.rules.findIndex((x) => x.id === r.id);
  if (i >= 0) idx.rules[i] = r;
  else idx.rules.push(r);
  all[r.tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_ALERT_RULES_KEY, all);
}
export function deleteAlertRuleRecord(dataDir: string, tenantId: string, id: string): void {
  const all = load<Record<string, AlrIndex>>(dataDir, NATIVE_DASHBOARD_ALERT_RULES_KEY, {});
  const idx = all[tenantId];
  if (!idx) return;
  idx.rules = idx.rules.filter((r) => r.id !== id);
  all[tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_ALERT_RULES_KEY, all);
}
// ── Runs (snapshots) ────────────────────────────────────────────────────────
interface RunIndex { runs: ReportRun[] }
export function listRuns(dataDir: string, tenantId: string, reportId?: string): ReportRun[] {
  const all = load<Record<string, RunIndex>>(dataDir, NATIVE_DASHBOARD_RUNS_KEY, {});
  const runs = all[tenantId]?.runs ?? [];
  return reportId ? runs.filter((r) => r.reportId === reportId) : runs;
}
export function getRun(dataDir: string, tenantId: string, runId: string): ReportRun | null {
  return listRuns(dataDir, tenantId).find((r) => r.id === runId) ?? null;
}
export function saveRun(dataDir: string, run: ReportRun): void {
  const all = load<Record<string, RunIndex>>(dataDir, NATIVE_DASHBOARD_RUNS_KEY, {});
  const idx = all[run.tenantId] ?? { runs: [] };
  const i = idx.runs.findIndex((x) => x.id === run.id);
  if (i >= 0) idx.runs[i] = run;
  else idx.runs.push(run);
  while (idx.runs.length > MAX_RUNS_PER_TENANT) idx.runs.shift(); // first-in evicted
  all[run.tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_RUNS_KEY, all);
}
// ── Alert records ───────────────────────────────────────────────────────────
interface AleIndex { alerts: AlertRecord[] }
export function listAlertRecords(dataDir: string, tenantId: string, reportId?: string): AlertRecord[] {
  const all = load<Record<string, AleIndex>>(dataDir, NATIVE_DASHBOARD_ALERT_RECORDS_KEY, {});
  const alerts = all[tenantId]?.alerts ?? [];
  return reportId ? alerts.filter((a) => a.reportId === reportId) : alerts;
}
export function saveAlertRecord(dataDir: string, a: AlertRecord): void {
  const all = load<Record<string, AleIndex>>(dataDir, NATIVE_DASHBOARD_ALERT_RECORDS_KEY, {});
  const idx = all[a.tenantId] ?? { alerts: [] };
  const existing = idx.alerts.findIndex((x) => x.id === a.id);
  if (existing >= 0) idx.alerts[existing] = a; // update-in-place (delivery write-back)
  else idx.alerts.push(a);
  while (idx.alerts.length > MAX_ALERTS_PER_TENANT) idx.alerts.shift();
  all[a.tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_ALERT_RECORDS_KEY, all);
}
// ── Pending writes (durable mirror of the approval card) ────────────────────
interface PendingIndex { pendingWrites: PendingDashboardWrite[] }
export function listPendingWrites(dataDir: string, tenantId: string): PendingDashboardWrite[] {
  return load<Record<string, PendingIndex>>(dataDir, NATIVE_DASHBOARD_PENDING_KEY, {})[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingDashboardWrite): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_DASHBOARD_PENDING_KEY, {});
  const idx = all[w.tenantId] ?? { pendingWrites: [] };
  idx.pendingWrites.push(w);
  all[w.tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_PENDING_KEY, all);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingDashboardWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingDashboardWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  result?: { reportId?: string | undefined; runId?: string | undefined; error?: string | undefined },
): void {
  const all = load<Record<string, PendingIndex>>(dataDir, NATIVE_DASHBOARD_PENDING_KEY, {});
  const idx = all[tenantId];
  const w = idx?.pendingWrites.find((x) => x.id === id);
  if (!idx || !w || w.status !== "pending") return; // idempotent
  w.status = status;
  if (status === "applied") w.appliedResult = { reportId: result?.reportId, runId: result?.runId };
  else w.error = result?.error ?? "rejected by owner";
  all[tenantId] = idx;
  save(dataDir, NATIVE_DASHBOARD_PENDING_KEY, all);
}
// ── Immutable audit (append-only) ───────────────────────────────────────────
function loadAudit(dataDir: string): NativeDashboardAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_DASHBOARD_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeDashboardAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeDashboardAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({ id: generateDashboardEntityId("pdw"), ts: new Date().toISOString(), ...entry });
  save(dataDir, NATIVE_DASHBOARD_AUDIT_KEY, audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeDashboardAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}