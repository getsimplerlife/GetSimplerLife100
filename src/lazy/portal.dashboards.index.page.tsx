/**
 * portal.dashboards.index.page.tsx — Phase 3.6 DASHBOARDS / BI, surfaced in
 * the portal.
 *
 * Slice 135: the dashboard router (/api/native/dashboard*) has been live and
 * tested since the 3.6 build, but no client file referenced it. This page is
 * UI ONLY and calls exactly the routes that exist:
 *
 *   GET  /api/native/dashboard                     → dashboards (+ widget count)
 *   GET  /api/native/dashboard/:id                 → dashboard + its widgets
 *   GET  /api/native/dashboard/reports             → reports (widget sources)
 *   GET  /api/native/dashboard/reports/:id/runs    → run history for one report
 *   GET  /api/native/dashboard/runs/:runId         → one run INCLUDING its
 *                                                    durable reduced rows
 *   POST /api/native/dashboard/reports/:id/run     → GATED run (202 pending)
 *   POST /api/native/dashboard/reports             → GATED report create
 *   POST /api/native/dashboard                     → GATED dashboard create
 *   GET  /api/native/dashboard/writes              → pending writes
 *   POST /api/native/dashboard/writes/:id/apply|reject → approval decision
 *   GET  /api/native/dashboard/schedules|alerts    → read-only distribution
 *
 * Widget data is REAL OR NOTHING: a widget renders the reduced rows of its
 * most recent durable run (label/value pairs the server computed from the
 * tenant's own 1.4 table rows). A report that has never run says so and offers
 * the gated run — no sample series, no invented chart, no fake axis.
 *
 * What is rendered, exactly (stated on the page):
 *   number  → the run's headline value
 *   bar     → horizontal bars scaled to the largest value in that run
 *   table   → the label/value rows
 *   line    → the same rows as an ORDERED LIST: the run stores label/value
 *             pairs with no time axis, so a plotted line would be invented.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";
import { PortalEmptyState, scrollToId } from "~/components/PortalEmptyState";
import { SignedOutNotice, ErrorLine, FeedbackLine } from "~/components/PortalPrimitiveShell";
import { authedJson, authedSend, barWidths, formatNumber, formatWhen } from "~/lib/portal-primitives";

interface DashboardSummary {
  id: string;
  name: string;
  description: string;
  widgetCount: number;
  version: number;
  createdAt: string;
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
  version: number;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}
interface RunRow {
  label: string | null;
  value: number;
}
interface Run {
  id: string;
  reportId: string;
  triggeredBy: string;
  triggeredAt: string;
  rows: RunRow[];
  headline: number | null;
  rowCount: number;
  error?: string;
}
interface PendingWrite {
  id: string;
  op: string;
  status: string;
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
}
interface TableOption {
  id: string;
  name: string;
  fields: { key: string; label?: string; type: string }[];
}
interface Schedule {
  id: string;
  name: string;
  reportId: string;
  cadence: string;
  timeUtc: string;
  format: string;
  status: string;
  nextRunAt: string;
}
interface AlertRule {
  id: string;
  name: string;
  reportId: string;
  metric: string;
  op: string;
  threshold: number;
  active: boolean;
}

const VIZ_KINDS = ["number", "bar", "table", "line"] as const;
const AGG_KINDS = ["count", "sum", "avg", "min", "max"] as const;

export default function DashboardsPage() {
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openName, setOpenName] = useState("");
  const [widgets, setWidgets] = useState<ReportSummary[]>([]);
  const [runs, setRuns] = useState<Record<string, Run | null>>({});
  const [busy, setBusy] = useState("");

  const [dashName, setDashName] = useState("");
  const [dashDesc, setDashDesc] = useState("");
  const [dashPicks, setDashPicks] = useState<string[]>([]);
  const [reportName, setReportName] = useState("");
  const [sourceTableId, setSourceTableId] = useState("");
  const [viz, setViz] = useState<string>("number");
  const [agg, setAgg] = useState<string>("count");
  const [groupBy, setGroupBy] = useState("");
  const [valueField, setValueField] = useState("");
  const [limit, setLimit] = useState("100");

  const load = useCallback(async () => {
    const [dashRes, repRes, tabRes, wrRes, schRes, alrRes] = await Promise.all([
      authedJson<{ dashboards: DashboardSummary[] }>("/api/native/dashboard"),
      authedJson<{ reports: ReportSummary[] }>("/api/native/dashboard/reports"),
      authedJson<{ tables: TableOption[] }>("/api/native/tables"),
      authedJson<{ writes: PendingWrite[] }>("/api/native/dashboard/writes"),
      authedJson<{ schedules: Schedule[] }>("/api/native/dashboard/schedules"),
      authedJson<{ rules: AlertRule[] }>("/api/native/dashboard/alerts"),
    ]);
    if (!dashRes.ok) {
      if (dashRes.signedOut) setSignedOut(true);
      else setError(dashRes.error);
      return;
    }
    setSignedOut(false);
    setError("");
    setDashboards(Array.isArray(dashRes.data?.dashboards) ? dashRes.data.dashboards : []);
    if (repRes.ok) setReports(Array.isArray(repRes.data?.reports) ? repRes.data.reports : []);
    if (tabRes.ok) setTables(Array.isArray(tabRes.data?.tables) ? tabRes.data.tables : []);
    if (wrRes.ok) setWrites(Array.isArray(wrRes.data?.writes) ? wrRes.data.writes : []);
    if (schRes.ok) setSchedules(Array.isArray(schRes.data?.schedules) ? schRes.data.schedules : []);
    if (alrRes.ok) setAlerts(Array.isArray(alrRes.data?.rules) ? alrRes.data.rules : []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  /** Latest durable run for one report, fetched by id (rows included). */
  const loadRun = useCallback(async (reportId: string): Promise<Run | null> => {
    const list = await authedJson<{ runs: Run[] }>(`/api/native/dashboard/reports/${reportId}/runs`);
    if (!list.ok) {
      if (list.signedOut) setSignedOut(true);
      else setError(list.error);
      return null;
    }
    const all = Array.isArray(list.data?.runs) ? list.data.runs : [];
    if (all.length === 0) return null;
    // Newest by triggeredAt — never assume array order.
    const newest = all.reduce((best, r) =>
      new Date(r.triggeredAt).getTime() >= new Date(best.triggeredAt).getTime() ? r : best,
    );
    const one = await authedJson<{ run: Run }>(`/api/native/dashboard/runs/${newest.id}`);
    if (!one.ok) {
      if (one.signedOut) setSignedOut(true);
      else setError(one.error);
      return null;
    }
    return one.data?.run ?? null;
  }, []);

  async function openDashboard(id: string) {
    setError("");
    setFeedback("");
    setBusy(`open:${id}`);
    const res = await authedJson<{ dashboard: DashboardSummary & { widgets: ReportSummary[] } }>(
      `/api/native/dashboard/${id}`,
    );
    if (!res.ok) {
      setBusy("");
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setOpenId(id);
    setOpenName(res.data.dashboard.name);
    const list = Array.isArray(res.data.dashboard.widgets) ? res.data.dashboard.widgets : [];
    setWidgets(list);
    const loaded: Record<string, Run | null> = {};
    for (const widget of list) loaded[widget.id] = await loadRun(widget.id);
    setRuns(loaded);
    setBusy("");
  }

  async function runReport(reportId: string) {
    setError("");
    setFeedback("");
    setBusy(`run:${reportId}`);
    const res = await authedSend<{ status: string; runId?: string }>(
      `/api/native/dashboard/reports/${reportId}/run`,
      "POST",
      {},
    );
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    if (res.data?.status === "pending") {
      setFeedback("Run queued for approval — the widget updates once the run is applied.");
    } else {
      setFeedback("Report ran — the widget now shows the fresh result.");
      const run = await loadRun(reportId);
      setRuns((prev) => ({ ...prev, [reportId]: run }));
    }
    await load();
  }

  async function createReport() {
    setError("");
    setFeedback("");
    if (!reportName.trim() || !sourceTableId) {
      setError("A report needs a name and a source table.");
      return;
    }
    const limitNumber = Number(limit);
    setBusy("create-report");
    const res = await authedSend<{ status: string; reportId?: string }>(
      "/api/native/dashboard/reports",
      "POST",
      {
        name: reportName.trim(),
        sourceTableId,
        viz,
        agg,
        ...(groupBy ? { groupBy } : {}),
        ...(valueField ? { valueField } : {}),
        ...(Number.isFinite(limitNumber) ? { limit: limitNumber } : {}),
      },
    );
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(
      res.data?.status === "pending"
        ? "Report queued for approval — it appears in the list once applied."
        : "Report created.",
    );
    setReportName("");
    await load();
  }

  async function createDashboard() {
    setError("");
    setFeedback("");
    if (!dashName.trim()) {
      setError("Give the dashboard a name first.");
      return;
    }
    setBusy("create-dashboard");
    const res = await authedSend<{ status: string; dashboardId?: string }>("/api/native/dashboard", "POST", {
      name: dashName.trim(),
      description: dashDesc.trim(),
      ...(dashPicks.length > 0 ? { reportIds: dashPicks } : {}),
    });
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(
      res.data?.status === "pending"
        ? "Dashboard queued for approval — it appears in the list once applied."
        : "Dashboard created.",
    );
    setDashName("");
    setDashDesc("");
    setDashPicks([]);
    await load();
  }

  async function decideWrite(write: PendingWrite, decision: "apply" | "reject") {
    setError("");
    setFeedback("");
    setBusy(`${decision}:${write.id}`);
    const res = await authedSend<{ status: string }>(
      `/api/native/dashboard/writes/${write.id}/${decision}`,
      "POST",
      decision === "apply" ? {} : undefined,
    );
    setBusy("");
    if (!res.ok) {
      if (res.signedOut) setSignedOut(true);
      else setError(res.error);
      return;
    }
    setFeedback(decision === "apply" ? `Applied (${write.op}).` : `Rejected (${write.op}).`);
    if (openId) await openDashboard(openId);
    else await load();
  }

  if (signedOut) return <SignedOutNotice surface="Dashboards" />;

  const selectedTable = tables.find((t) => t.id === sourceTableId);
  const pendingWrites = writes.filter((w) => w.status === "pending");

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboards</h1>
        <p className="text-sm text-stone-500">
          Native BI over your own tables. A report reduces rows from one table into label/value pairs; a dashboard groups
          reports as widgets. Runs are computed on the server from real rows — this page never draws a number it did not
          receive.
        </p>
      </div>

      <ErrorLine message={error} />
      <FeedbackLine message={feedback} />

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Your dashboards ({dashboards.length})</h2>
          {loading ? (
            <p className="text-sm text-stone-500">Loading…</p>
          ) : dashboards.length === 0 ? (
            <PortalEmptyState
              title="No dashboards yet"
              body="A dashboard groups report widgets. Create a report from one of your tables below, then group it into a dashboard."
              action={{ label: "Open the report builder", onClick: () => scrollToId("report-composer") }}
            />
          ) : (
            <div className="space-y-3">
              {dashboards.map((d) => (
                <div key={d.id} className="rounded border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{d.name}</span>
                        <Badge variant="stone">{d.widgetCount} widget{d.widgetCount === 1 ? "" : "s"}</Badge>
                      </div>
                      <p className="text-sm text-stone-500">updated {formatWhen(d.updatedAt)}</p>
                      {d.description && <p className="text-xs text-stone-400">{d.description}</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDashboard(d.id)}
                      disabled={busy === `open:${d.id}`}
                    >
                      {busy === `open:${d.id}` ? "Opening…" : openId === d.id ? "Reload" : "Open"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {openId && (
        <Card>
          <div className="p-6">
            <h2 className="mb-1 text-lg font-semibold">{openName}</h2>
            <p className="mb-3 text-xs text-stone-500">
              Widgets render the most recent durable run of each report. Rendered shapes: number (headline value), bar
              (bars scaled to that run's largest value), table (label/value rows), and line (the same rows as an ordered
              list — the run stores no time axis, so no line is plotted).
            </p>
            {widgets.length === 0 ? (
              <PortalEmptyState
                title="This dashboard has no widgets yet"
                body="Add reports to it from the report builder below, then reopen the dashboard."
                compact
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {widgets.map((w) => {
                  const run = runs[w.id] ?? null;
                  const values = (run?.rows ?? []).map((r) => r.value);
                  const widths = barWidths(values);
                  return (
                    <div key={w.id} className="rounded border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{w.name}</p>
                          <p className="text-xs text-stone-500">
                            {w.viz} · {w.agg}
                            {w.groupBy ? ` by ${w.groupBy}` : ""}
                            {w.valueField ? ` of ${w.valueField}` : ""} · {w.runCount} run
                            {w.runCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runReport(w.id)}
                          disabled={busy === `run:${w.id}`}
                        >
                          {busy === `run:${w.id}` ? "Queueing…" : "Run now"}
                        </Button>
                      </div>

                      {!run ? (
                        <p className="mt-3 rounded border border-dashed p-3 text-xs text-stone-500">
                          Not computed yet — this report has no run. “Run now” queues a run for approval; the widget stays
                          empty until the run is applied.
                        </p>
                      ) : run.error ? (
                        <p className="mt-3 text-xs text-red-500">The last run failed: {run.error}</p>
                      ) : w.viz === "number" ? (
                        <div className="mt-3">
                          <p className="text-3xl font-black">{formatNumber(run.headline ?? run.rows[0]?.value ?? null)}</p>
                          <p className="text-xs text-stone-500">
                            computed {formatWhen(run.triggeredAt)} by {run.triggeredBy}
                          </p>
                        </div>
                      ) : w.viz === "bar" ? (
                        <div className="mt-3 space-y-1">
                          {run.rows.length === 0 ? (
                            <p className="text-xs text-stone-500">The last run returned no rows.</p>
                          ) : widths.length === 0 ? (
                            <p className="text-xs text-stone-500">
                              Every value in the last run is zero — no bars are drawn.
                            </p>
                          ) : (
                            run.rows.map((r, i) => (
                              <div key={`${r.label ?? "row"}-${i}`} className="text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="truncate text-stone-600">{r.label ?? "(total)"}</span>
                                  <span className="ml-2 font-mono text-stone-500">{formatNumber(r.value)}</span>
                                </div>
                                <div className="h-2 w-full rounded bg-stone-100">
                                  <div className="h-2 rounded bg-emerald-500" style={{ width: `${widths[i] ?? 0}%` }} />
                                </div>
                              </div>
                            ))
                          )}
                          <p className="pt-1 text-xs text-stone-400">
                            computed {formatWhen(run.triggeredAt)} by {run.triggeredBy}
                          </p>
                        </div>
                      ) : w.viz === "table" ? (
                        <table className="mt-3 w-full text-left text-xs">
                          <thead>
                            <tr className="border-b text-stone-500">
                              <th className="py-1">label</th>
                              <th className="py-1">value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {run.rows.map((r, i) => (
                              <tr key={`${r.label ?? "row"}-${i}`} className="border-b">
                                <td className="py-1">{r.label ?? "(total)"}</td>
                                <td className="py-1 font-mono">{formatNumber(r.value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <ol className="mt-3 space-y-1 text-xs">
                          {run.rows.map((r, i) => (
                            <li key={`${r.label ?? "row"}-${i}`} className="flex justify-between border-b py-1">
                              <span className="truncate text-stone-600">{r.label ?? "(total)"}</span>
                              <span className="ml-2 font-mono text-stone-500">{formatNumber(r.value)}</span>
                            </li>
                          ))}
                          <li className="pt-1 text-stone-400">
                            Ordered series — the run stores no time axis, so this is not plotted as a line.
                          </li>
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card id="report-composer">
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Create a report</h2>
          {tables.length === 0 ? (
            <PortalEmptyState
              title="No tables to report on yet"
              body="Reports read one of your native tables. Create a table first, then come back."
              action={{ label: "Open tables", to: "/portal/tables" }}
              compact
            />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Name
                  <input
                    className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                    placeholder="Revenue by region"
                  />
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Source table
                  <select
                    className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                    value={sourceTableId}
                    onChange={(e) => {
                      setSourceTableId(e.target.value);
                      setGroupBy("");
                      setValueField("");
                    }}
                  >
                    <option value="">Pick a table</option>
                    {tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Shape
                  <select
                    className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                    value={viz}
                    onChange={(e) => setViz(e.target.value)}
                  >
                    {VIZ_KINDS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Aggregation
                  <select
                    className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                    value={agg}
                    onChange={(e) => setAgg(e.target.value)}
                  >
                    {AGG_KINDS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Group by (optional)
                  <select
                    className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value)}
                  >
                    <option value="">No grouping (single number)</option>
                    {(selectedTable?.fields ?? []).map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label || f.key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Value field {agg === "count" ? "(not needed for count)" : ""}
                  <select
                    className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                    value={valueField}
                    onChange={(e) => setValueField(e.target.value)}
                  >
                    <option value="">—</option>
                    {(selectedTable?.fields ?? []).map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label || f.key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Max rows
                  <input
                    className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </label>
              </div>
              <Button className="mt-3" onClick={createReport} disabled={busy === "create-report"}>
                {busy === "create-report" ? "Queueing…" : "Create report"}
              </Button>
              <p className="mt-2 text-xs text-stone-500">
                Creating a report is a gated write — it is queued for approval and appears in the list once applied.
              </p>
            </>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Reports ({reports.length})</h2>
          {reports.length === 0 ? (
            <PortalEmptyState
              title="No reports yet"
              body="A report is one reduction over one table. Create one above — it becomes a widget once a dashboard groups it."
              compact
            />
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                  <span>
                    <span className="font-medium">{r.name}</span>{" "}
                    <span className="text-stone-500">
                      · {r.viz} · {r.agg}
                      {r.groupBy ? ` by ${r.groupBy}` : ""} · {r.runCount} run{r.runCount === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => runReport(r.id)} disabled={busy === `run:${r.id}`}>
                    {busy === `run:${r.id}` ? "Queueing…" : "Run now"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Create a dashboard</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Name
              <input
                className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                value={dashName}
                onChange={(e) => setDashName(e.target.value)}
                placeholder="Weekly ops"
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Description
              <input
                className="mt-1 w-full rounded border p-2 text-sm font-normal normal-case tracking-normal text-stone-900"
                value={dashDesc}
                onChange={(e) => setDashDesc(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          {reports.length > 0 && (
            <fieldset className="mt-3">
              <legend className="text-xs font-bold uppercase tracking-wider text-stone-500">Widgets</legend>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {reports.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm text-stone-600">
                    <input
                      type="checkbox"
                      checked={dashPicks.includes(r.id)}
                      onChange={(e) =>
                        setDashPicks((prev) => (e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id)))
                      }
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <Button className="mt-3" onClick={createDashboard} disabled={busy === "create-dashboard"}>
            {busy === "create-dashboard" ? "Queueing…" : "Create dashboard"}
          </Button>
          <p className="mt-2 text-xs text-stone-500">
            Creating a dashboard is a gated write — it is queued for approval and appears in the list once applied.
          </p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="mb-3 text-lg font-semibold">Pending writes ({pendingWrites.length})</h2>
          {pendingWrites.length === 0 ? (
            <p className="text-sm text-stone-500">Nothing waiting for approval.</p>
          ) : (
            <div className="space-y-2">
              {pendingWrites.map((w) => (
                <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                  <span className="text-stone-500">
                    <code>{w.op}</code> · {w.requestedBy} · {formatWhen(w.requestedAt)}
                  </span>
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => decideWrite(w, "apply")}
                      disabled={busy === `apply:${w.id}`}
                    >
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decideWrite(w, "reject")}
                      disabled={busy === `reject:${w.id}`}
                    >
                      Reject
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="mb-1 text-lg font-semibold">Scheduled delivery &amp; alerts</h2>
          <p className="mb-3 text-xs text-stone-500">
            Read-only here: these records exist for this workspace and are shown exactly as stored. An active schedule
            renders its report on its UTC anchor and stores the run; alert rules are evaluated on every run.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Schedules ({schedules.length})</p>
              {schedules.length === 0 ? (
                <p className="text-sm text-stone-500">No schedules.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm">
                  {schedules.map((s) => (
                    <li key={s.id}>
                      {s.name} · {s.cadence} at {s.timeUtc} UTC · {s.format} · {s.status}
                      {s.nextRunAt ? ` · next ${formatWhen(s.nextRunAt)}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Alert rules ({alerts.length})</p>
              {alerts.length === 0 ? (
                <p className="text-sm text-stone-500">No alert rules.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm">
                  {alerts.map((a) => (
                    <li key={a.id}>
                      {a.name} · {a.metric} {a.op} {formatNumber(a.threshold)} · {a.active ? "breached" : "clear"}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
