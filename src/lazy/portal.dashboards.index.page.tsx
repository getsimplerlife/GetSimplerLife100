import { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Badge, Button } from "~/components/ui";
// ── Types (Phase 3.6 native embedded dashboards/BI — report builder over 1.4
//    tables + scheduled PDF/CSV/email distribution + thresholds/alerts;
//    deterministic computation, NO LLM) ────────────────────────────────────
interface DashboardSummary {
  id: string;
  name: string;
  description: string;
  widgetCount: number;
  updatedAt: string;
}
interface ReportSummary {
  id: string;
  name: string;
  description: string;
  sourceTableId: string;
  viz: string;
  agg: string;
  groupBy: string | null;
  valueField: string | null;
  sortDir: string;
  limit: number;
  runCount: number;
  updatedAt: string;
}
interface TableOption {
  id: string;
  name: string;
  fields: Array<{ key: string; label: string; type: string }>;
}
interface ScheduleSummary {
  id: string;
  reportId: string;
  name: string;
  cadence: string;
  timeUtc: string;
  format: string;
  recipients: string[];
  status: string;
  nextRunAt: string;
}
interface AlertRuleSummary {
  id: string;
  reportId: string;
  name: string;
  metric: string;
  op: string;
  threshold: number;
  recipients: string[];
  active: boolean;
}
interface AlertRecordSummary {
  id: string;
  reportId: string;
  firedAt: string;
  metric: number;
  op: string;
  threshold: number;
  notified: boolean;
}
interface RunSummary {
  id: string;
  reportId: string;
  triggeredBy: string;
  triggeredAt: string;
  rowCount: number;
  headline: number | null;
  artifactKind: string | null;
  error?: string;
}
interface PendingWrite {
  id: string;
  op: string;
  status: string;
  requestedAt: string;
}
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}
const VIZ_LABEL: Record<string, string> = { table: "Table", bar: "Bar", line: "Line", number: "Number" };
const AGG_LABEL: Record<string, string> = { count: "Count", sum: "Sum", avg: "Avg", min: "Min", max: "Max" };
const CADENCE_LABEL: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const OP_LABEL: Record<string, string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=", neq: "≠" };
const EMPTY_REPORT = {
  name: "",
  description: "",
  sourceTableId: "",
  viz: "bar",
  agg: "count",
  groupBy: "",
  valueField: "",
  sortDir: "desc",
  limit: 100,
};
const EMPTY_SCHEDULE = { name: "", reportId: "", cadence: "daily", timeUtc: "09:00", format: "csv", recipients: "" };
const EMPTY_ALERT = { name: "", reportId: "", metric: "agg", op: "lt", threshold: 0, recipients: "" };

export default function NativeDashboardsPage() {
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [rules, setRules] = useState<AlertRuleSummary[]>([]);
  const [records, setRecords] = useState<AlertRecordSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [pending, setPending] = useState<PendingWrite[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"dashboards" | "reports" | "schedules" | "alerts">("reports");
  const [reportForm, setReportForm] = useState({ ...EMPTY_REPORT });
  const [scheduleForm, setScheduleForm] = useState({ ...EMPTY_SCHEDULE });
  const [alertForm, setAlertForm] = useState({ ...EMPTY_ALERT });
  const [dashboardName, setDashboardName] = useState("");
  const [dashboardReports, setDashboardReports] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const [d, r, t, s, a, runsRes, p] = await Promise.all([
        api<{ dashboards: DashboardSummary[] }>("GET", "/api/native/dashboard"),
        api<{ reports: ReportSummary[] }>("GET", "/api/native/dashboard/reports"),
        api<any>("GET", "/api/native/tables") as Promise<{ tables: TableOption[] }>,
        api<{ schedules: ScheduleSummary[] }>("GET", "/api/native/dashboard/schedules"),
        api<{ rules: AlertRuleSummary[]; records: AlertRecordSummary[] }>("GET", "/api/native/dashboard/alerts"),
        api<{ runs: RunSummary[] }>("GET", "/api/native/dashboard/runs"),
        api<{ writes: PendingWrite[] }>("GET", "/api/native/dashboard/writes"),
      ]);
      setDashboards(d.dashboards ?? []);
      setReports(r.reports ?? []);
      setTables(t.tables ?? []);
      setSchedules(s.schedules ?? []);
      setRules(a.rules ?? []);
      setRecords(a.records ?? []);
      setRuns(runsRes.runs ?? []);
      setPending(p.writes ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const res = (await fn()) as { data?: { status?: string; approvalActionId?: string } };
      const status = res?.data?.status;
      if (status === "pending" && res?.data?.approvalActionId) setNotice("Queued for approval — approve it in the Approvals page to apply.");
      else if (status === "applied") setNotice("Applied.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const createReport = () => run(() =>
    api("POST", "/api/native/dashboard/reports", { ...reportForm, groupBy: reportForm.groupBy || null, valueField: reportForm.valueField || null }),
  );
  const runReport = (id: string, format: "csv" | "pdf" | null) => run(() =>
    api("POST", `/api/native/dashboard/reports/${id}/run`, { format }),
  );
  const deleteReport = (id: string) => run(() => api("POST", `/api/native/dashboard/reports/${id}/delete`));
  const createSchedule = () =>
    run(() =>
      api("POST", "/api/native/dashboard/schedules", {
        ...scheduleForm,
        recipients: scheduleForm.recipients.split(",").map((r) => r.trim()).filter(Boolean),
      }),
    );
  const scheduleAction = (id: string, sub: string) => run(() => api("POST", `/api/native/dashboard/schedules/${id}/${sub}`));
  const createAlert = () =>
    run(() =>
      api("POST", "/api/native/dashboard/alerts", {
        ...alertForm,
        recipients: alertForm.recipients.split(",").map((r) => r.trim()).filter(Boolean),
      }),
    );
  const alertAction = (id: string, sub: string) => run(() => api("POST", `/api/native/dashboard/alerts/${id}/${sub}`));
  const createDashboard = () =>
    run(() =>
      api("POST", "/api/native/dashboard", {
        name: dashboardName,
        description: "",
        reportIds: dashboardReports.split(",").map((r) => r.trim()).filter(Boolean),
      }),
    );
  const pendingAction = (id: string, action: "apply" | "reject") => run(() => api("POST", `/api/native/dashboard/writes/${id}/${action}`));
  const tablesFor = (id: string) => (tables.find((t) => t.id === id)?.fields ?? []).map((f) => f.key);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboards & BI</h1>
          <p className="text-sm text-slate-400 mt-1">
            Native report builder over your tables + scheduled PDF/CSV/email distribution + thresholds/alerts. Deterministic — no AI cost.
          </p>
        </div>
        <div className="flex gap-2">
          {(["reports", "dashboards", "schedules", "alerts"] as const).map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "primary" : "outline"} onClick={() => setTab(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}
      {tab === "reports" && (
        <>
          <Card>
            <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Build a report</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" placeholder="Report name *" value={reportForm.name} onChange={(e) => setReportForm({ ...reportForm, name: e.target.value })} />
                <select className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" value={reportForm.sourceTableId} onChange={(e) => setReportForm({ ...reportForm, sourceTableId: e.target.value, groupBy: "", valueField: "" })}>
                  <option value="">Source table *</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <select className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" value={reportForm.viz} onChange={(e) => setReportForm({ ...reportForm, viz: e.target.value })}>
                  {Object.entries(VIZ_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" placeholder="Group by field" value={reportForm.groupBy} onChange={(e) => setReportForm({ ...reportForm, groupBy: e.target.value })} list="dashboard-field-options" />
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" placeholder="Value field (sum/avg/min/max)" value={reportForm.valueField} onChange={(e) => setReportForm({ ...reportForm, valueField: e.target.value })} list="dashboard-field-options" />
                <select className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" value={reportForm.agg} onChange={(e) => setReportForm({ ...reportForm, agg: e.target.value })}>
                  {Object.entries(AGG_LABEL).map(([a, l]) => (
                    <option key={a} value={a}>{l}</option>
                  ))}
                </select>
              </div>
              <datalist id="dashboard-field-options">
                {tablesFor(reportForm.sourceTableId).map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={createReport} disabled={busy || !reportForm.name || !reportForm.sourceTableId}>Create report</Button>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Reports (${reports.length})</p>
              {reports.length === 0 && <p className="text-sm text-slate-400">No reports yet — create one above.</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {reports.map((r) => (
                  <div key={r.id} className="border border-stone-800 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm">{r.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {VIZ_LABEL[r.viz]} · {AGG_LABEL[r.agg]} by {r.groupBy ?? "whole table"} · {r.runCount} runs
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" onClick={() => runReport(r.id, null)} disabled={busy}>Run</Button>
                        <Button size="sm" variant="outline" onClick={() => runReport(r.id, "csv")} disabled={busy}>CSV</Button>
                        <Button size="sm" variant="outline" onClick={() => runReport(r.id, "pdf")} disabled={busy}>PDF</Button>
                        <Button size="sm" variant="danger" onClick={() => deleteReport(r.id)} disabled={busy}>✕</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}
      {tab === "dashboards" && (
        <>
          <Card>
            <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Create a dashboard</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" placeholder="Dashboard name *" value={dashboardName} onChange={(e) => setDashboardName(e.target.value)} />
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" placeholder="Report ids (comma-separated)" value={dashboardReports} onChange={(e) => setDashboardReports(e.target.value)} />
              </div>
              <div className="mt-3">
                <Button size="sm" onClick={createDashboard} disabled={busy || !dashboardName}>Create dashboard</Button>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Dashboards (${dashboards.length})</p>
              {dashboards.length === 0 && <p className="text-sm text-slate-400">No dashboards yet.</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dashboards.map((d) => (
                  <div key={d.id} className="border border-stone-800 rounded-xl p-4">
                    <p className="font-bold text-sm">{d.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{d.widgetCount} widget(s)</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}
      {tab === "schedules" && (
        <>
          <Card>
            <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Schedule distribution</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" placeholder="Schedule name *" value={scheduleForm.name} onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })} />
                <select className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" value={scheduleForm.reportId} onChange={(e) => setScheduleForm({ ...scheduleForm, reportId: e.target.value })}>
                  <option value="">Report *</option>
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <select className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" value={scheduleForm.cadence} onChange={(e) => setScheduleForm({ ...scheduleForm, cadence: e.target.value })}>
                  {Object.entries(CADENCE_LABEL).map(([c, l]) => (
                    <option key={c} value={c}>{l}</option>
                  ))}
                </select>
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" placeholder="HH:MM (UTC)" value={scheduleForm.timeUtc} onChange={(e) => setScheduleForm({ ...scheduleForm, timeUtc: e.target.value })} />
                <select className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" value={scheduleForm.format} onChange={(e) => setScheduleForm({ ...scheduleForm, format: e.target.value })}>
                  <option value="csv">CSV</option>
                  <option value="pdf">PDF</option>
                </select>
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" placeholder="Recipients (comma-separated)" value={scheduleForm.recipients} onChange={(e) => setScheduleForm({ ...scheduleForm, recipients: e.target.value })} />
              </div>
              <div className="mt-3">
                <Button size="sm" onClick={createSchedule} disabled={busy || !scheduleForm.name || !scheduleForm.reportId}>Create schedule</Button>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Schedules (${schedules.length})</p>
              {schedules.length === 0 && <p className="text-sm text-slate-400">No schedules yet.</p>}
              {schedules.map((s) => (
                <div key={s.id} className="border border-stone-800 rounded-xl p-4 mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm">{s.name} <Badge variant={s.status === "active" ? "emerald" : s.status === "archived" ? "stone" : "stone"}>{s.status}</Badge></p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {CADENCE_LABEL[s.cadence]} {s.timeUtc} UTC · {s.format.toUpperCase()} · {s.recipients.length} recipient(s) · next {new Date(s.nextRunAt).toISOString().slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {s.status === "draft" && <Button size="sm" onClick={() => scheduleAction(s.id, "activate")} disabled={busy}>Activate</Button>}
                    {s.status === "active" && <Button size="sm" variant="outline" onClick={() => scheduleAction(s.id, "archive")} disabled={busy}>Archive</Button>}
                    {s.status === "draft" && <Button size="sm" variant="danger" onClick={() => scheduleAction(s.id, "delete")} disabled={busy}>✕</Button>}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </>
      )}
      {tab === "alerts" && (
        <>
          <Card>
            <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Thresholds & alerts</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" placeholder="Alert name *" value={alertForm.name} onChange={(e) => setAlertForm({ ...alertForm, name: e.target.value })} />
                <select className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" value={alertForm.reportId} onChange={(e) => setAlertForm({ ...alertForm, reportId: e.target.value })}>
                  <option value="">Report *</option>
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <select className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" value={alertForm.op} onChange={(e) => setAlertForm({ ...alertForm, op: e.target.value })}>
                  {Object.entries(OP_LABEL).map(([o, l]) => (
                    <option key={o} value={o}>{l}</option>
                  ))}
                </select>
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" type="number" placeholder="Threshold" value={String(alertForm.threshold)} onChange={(e) => setAlertForm({ ...alertForm, threshold: Number(e.target.value) })} />
                <input className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-sm" placeholder="Recipients (comma-separated)" value={alertForm.recipients} onChange={(e) => setAlertForm({ ...alertForm, recipients: e.target.value })} />
              </div>
              <div className="mt-3">
                <Button size="sm" onClick={createAlert} disabled={busy || !alertForm.name || !alertForm.reportId}>Create alert rule</Button>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Alert rules (${rules.length})</p>
              {rules.length === 0 && <p className="text-sm text-slate-400">No alert rules yet.</p>}
              {rules.map((a) => (
                <div key={a.id} className="border border-stone-800 rounded-xl p-4 mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-sm">{a.name} <Badge variant={a.active ? "warning" : "stone"}>{a.active ? "FIRING" : "armed"}</Badge></p>
                    <p className="text-[11px] text-slate-500 mt-0.5">metric {a.metric} {OP_LABEL[a.op]} {a.threshold} · {a.recipients.length} recipient(s)</p>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => alertAction(a.id, "delete")} disabled={busy}>✕</Button>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Fired alerts (${records.length})</p>
              {records.length === 0 && <p className="text-sm text-slate-400">No fired alerts yet.</p>}
              {[...records].reverse().slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 border-t border-stone-900 py-2 text-xs first:border-t-0">
                  <span className="text-stone-300">{new Date(r.firedAt).toISOString().slice(0, 16).replace("T", " ")} — metric {r.metric} {OP_LABEL[r.op]} {r.threshold}</span>
                  <Badge variant={r.notified ? "emerald" : "stone"}>{r.notified ? "notified" : "queued"}</Badge>
                </div>
              ))}
            </CardBody>
          </Card>
        </>
      )}
      <Card>
        <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Recent runs (${runs.length} retained)</p>
          {runs.length === 0 && <p className="text-sm text-slate-400">No report runs yet.</p>}
          {[...runs].reverse().slice(0, 8).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-t border-stone-900 py-2 text-xs first:border-t-0">
              <span className="text-stone-300">{new Date(r.triggeredAt).toISOString().slice(0, 16).replace("T", " ")} · {r.reportId} · {r.rowCount} rows{r.headline !== null && r.headline !== undefined ? ` · headline ${r.headline}` : ""}</span>
              <span className="flex items-center gap-2">
                {r.artifactKind && r.artifactKind.startsWith("application/pdf") && <a className="text-blue-400 hover:text-blue-300 font-bold" href={`/api/native/dashboard/runs/${r.id}/artifact`}>PDF</a>}
                {r.artifactKind && r.artifactKind.startsWith("text/csv") && <a className="text-blue-400 hover:text-blue-300 font-bold" href={`/api/native/dashboard/runs/${r.id}/artifact`}>CSV</a>}
                <Badge variant={r.error ? "danger" : "emerald"}>{r.error ? "error" : "ok"}</Badge>
              </span>
            </div>
          ))}
        </CardBody>
      </Card>
      {pending.length > 0 && (
        <Card>
          <CardBody><p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Pending approvals (${pending.length})</p>
            {pending.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-2 border-t border-stone-900 py-2 text-xs first:border-t-0">
                <span className="font-mono text-stone-300">{w.op} · {new Date(w.requestedAt).toISOString().slice(0, 16).replace("T", " ")}</span>
                <span className="flex gap-1.5">
                  <Button size="sm" onClick={() => pendingAction(w.id, "apply")} disabled={busy}>Apply</Button>
                  <Button size="sm" variant="outline" onClick={() => pendingAction(w.id, "reject")} disabled={busy}>Reject</Button>
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}