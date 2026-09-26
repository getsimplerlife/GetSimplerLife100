/**
 * native/dashboard/router.ts — HTTP surface for Phase 3.6 native embedded
 * dashboards / BI (report builder over 1.4 tables + scheduled PDF/CSV/email
 * distribution + thresholds/alerts).
 *
 * AUTHED ONLY (/api/native/dashboard*): dashboard/report/schedule/alert-rule
 * CRUD + run lanes + artifact download + pending-write decision lanes.
 * 404 on any foreign/unknown id (fail-closed — cross-tenant → null → 404,
 * no IDOR); forged create-ids → 400 via the gate's validation-BEFORE-gate;
 * prod-server wires this AFTER the session check so anonymous → 401.
 * NO public share surface (3.2/3.3 precedent).
 *
 * Explicit-segment parsing only (no two-capture regex — the 1.4 rowMatch
 * shadowing class is avoided). Dashboard ids (dsh_) can never collide with the
 * literal sub-prefixes reports/schedules/alerts/runs/writes.
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  getDashboard,
  getReport,
  getRun,
  getSchedule,
  listAlertRecords,
  listAlertRules,
  listAllSchedules,
  listDashboards,
  listPendingWrites,
  listReports,
  listRuns,
  listSchedules,
  listAudit,
} from "./store";
import {
  executePendingDashboardWrite,
  fireScheduleNow,
  noteOwnerDecision,
  submitDashboardWrite,
  type DashboardWriteRequest,
} from "./gate";
export interface NativeDashboardCtx {
  userEmail: string;
  dataDir: string;
}
const json400 = (error: string) => Response.json({ error }, { status: 400 });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|not active|accepted/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 400 });
}
const DSH_RE = /^dsh_[A-Za-z0-9_-]+$/;
const RPT_RE = /^rpt_[A-Za-z0-9_-]+$/;
const SCH_RE = /^sch_[A-Za-z0-9_-]+$/;
const ALR_RE = /^alr_[A-Za-z0-9_-]+$/;
const RSN_RE = /^rsn_[A-Za-z0-9_-]+$/;
function reportSummary(r: NonNullable<ReturnType<typeof getReport>>, ctx: NativeDashboardCtx): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    sourceTableId: r.sourceTableId,
    viz: r.viz,
    agg: r.agg,
    groupBy: r.groupBy ?? null,
    valueField: r.valueField ?? null,
    sortDir: r.sortDir,
    limit: r.limit,
    version: r.version,
    runCount: listRuns(ctx.dataDir, r.tenantId, r.id).length,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
function runSummary(r: NonNullable<ReturnType<typeof getRun>>): Record<string, unknown> {
  return {
    id: r.id,
    reportId: r.reportId,
    triggeredBy: r.triggeredBy,
    triggeredAt: r.triggeredAt,
    rowCount: r.rowCount,
    headline: r.headline,
    artifactKind: r.artifact ? r.artifact.mime : null,
    deliveries: r.deliveries ?? undefined,
    error: r.error ?? undefined,
  };
}
function scheduleSummary(s: NonNullable<ReturnType<typeof getSchedule>>): Record<string, unknown> {
  return {
    id: s.id,
    reportId: s.reportId,
    name: s.name,
    cadence: s.cadence,
    timeUtc: s.timeUtc,
    format: s.format,
    recipients: s.recipients,
    status: s.status,
    nextRunAt: s.nextRunAt,
    version: s.version,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
/** READ (no gate). */
function getHandler(seg: string[], tenantId: string, ctx: NativeDashboardCtx): Response {
  // /api/native/dashboard — dashboards overview
  if (seg.length === 0) {
    const dashboards = listDashboards(ctx.dataDir, tenantId);
    return Response.json({
      data: {
        dashboards: dashboards.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          widgetCount: d.reportIds.length,
          version: d.version,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        })),
      },
    });
  }
  // /api/native/dashboard/reports — report builder listing
  if (seg[0] === "reports") {
    if (seg.length === 1) {
      const reports = listReports(ctx.dataDir, tenantId);
      return Response.json({ data: { reports: reports.map((r) => reportSummary(r, ctx)) } });
    }
    if (seg.length === 2 && RPT_RE.test(seg[1] ?? "")) {
      const r = getReport(ctx.dataDir, tenantId, seg[1]!);
      if (!r) return json404("report not found"); // 404-no-IDOR
      return Response.json({ data: { report: reportSummary(r, ctx) } });
    }
    if (seg.length === 3 && seg[1] === "runs" && RPT_RE.test(seg[2] ?? "")) {
      const r = getReport(ctx.dataDir, tenantId, seg[2]!);
      if (!r) return json404("report not found");
      return Response.json({ data: { runs: listRuns(ctx.dataDir, tenantId, r.id).map(runSummary) } });
    }
    return json404("Unknown native dashboard endpoint");
  }
  // /api/native/dashboard/schedules — distribution schedules
  if (seg[0] === "schedules") {
    if (seg.length === 1) {
      const schedules = listSchedules(ctx.dataDir, tenantId);
      return Response.json({ data: { schedules: schedules.map(scheduleSummary) } });
    }
    if (seg.length === 2 && SCH_RE.test(seg[1] ?? "")) {
      const s = getSchedule(ctx.dataDir, tenantId, seg[1]!);
      if (!s) return json404("schedule not found");
      return Response.json({ data: { schedule: scheduleSummary(s) } });
    }
    return json404("Unknown native dashboard endpoint");
  }
  // /api/native/dashboard/alerts — alert rules + fired alert records
  if (seg[0] === "alerts") {
    if (seg.length === 1) {
      const rules = listAlertRules(ctx.dataDir, tenantId);
      return Response.json({
        data: {
          rules: rules.map((a) => ({
            id: a.id,
            reportId: a.reportId,
            name: a.name,
            metric: a.metric,
            op: a.op,
            threshold: a.threshold,
            recipients: a.recipients,
            active: a.active,
            version: a.version,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
          })),
          records: listAlertRecords(ctx.dataDir, tenantId).map((rec) => ({
            id: rec.id,
            ruleId: rec.ruleId,
            reportId: rec.reportId,
            runId: rec.runId,
            firedAt: rec.firedAt,
            metric: rec.metric,
            op: rec.op,
            threshold: rec.threshold,
            notified: rec.notified,
            deliveries: rec.deliveries,
          })),
        },
      });
    }
    return json404("Unknown native dashboard endpoint");
  }
  // /api/native/dashboard/runs — run history + artifact download
  if (seg[0] === "runs") {
    if (seg.length === 1) {
      return Response.json({ data: { runs: listRuns(ctx.dataDir, tenantId).map(runSummary) } });
    }
    if (seg.length === 2 && RSN_RE.test(seg[1] ?? "")) {
      const run = getRun(ctx.dataDir, tenantId, seg[1]!);
      if (!run) return json404("run not found"); // 404-no-IDOR
      return Response.json({ data: { run } });
    }
    if (seg.length === 3 && seg[2] === "artifact" && RSN_RE.test(seg[1] ?? "")) {
      const run = getRun(ctx.dataDir, tenantId, seg[1]!);
      if (!run || !run.artifact) return json404("run artifact not found");
      const bytes = Buffer.from(run.artifact.base64, "base64");
      return new Response(bytes, {
        headers: {
          "content-type": run.artifact.mime,
          "content-disposition": `attachment; filename="report-run-${run.id}.${run.artifact.kind}"`,
        },
      });
    }
    return json404("Unknown native dashboard endpoint");
  }
  // /api/native/dashboard/writes — pending writes mirror
  if (seg[0] === "writes" && seg.length === 1) {
    return Response.json({
      data: {
        writes: listPendingWrites(ctx.dataDir, tenantId)
          .filter((w) => w.status === "pending")
          .map((w) => ({ id: w.id, op: w.op, status: w.status, approvalActionId: w.approvalActionId, requestedBy: w.requestedBy, requestedAt: w.requestedAt })),
      },
    });
  }
  // /api/native/dashboard/audit — immutable audit (read-only)
  if (seg[0] === "audit" && seg.length === 1) {
    return Response.json({ data: { audit: listAudit(ctx.dataDir, tenantId).slice(-100).reverse() } });
  }
  // /api/native/dashboard/:id — dashboard detail (widgets with report defs)
  if (seg.length === 1 && DSH_RE.test(seg[0] ?? "")) {
    const d = getDashboard(ctx.dataDir, tenantId, seg[0]!);
    if (!d) return json404("dashboard not found"); // 404-no-IDOR
    const widgets = d.reportIds
      .map((rid) => getReport(ctx.dataDir, tenantId, rid))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => reportSummary(r, ctx));
    return Response.json({ data: { dashboard: { ...d, widgets } } });
  }
  return json404("Unknown native dashboard endpoint");
}
function handleAuthedAsync(req: Request, ctx: NativeDashboardCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/dashboard\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail?.trim() ?? "";
  if (!tenantId) return Promise.resolve(json400("user email required"));
  if (req.method === "GET") return Promise.resolve(getHandler(seg, tenantId, ctx));
  if (req.method !== "POST") return Promise.resolve(json405());
  return (async () => {
    // ── WRITE lanes (all ride the Approval Queue verb-first) ─────────────
    // /api/native/dashboard — create dashboard
    if (seg.length === 0) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return json400("body must be a JSON object");
      const res = submitDashboardWrite(ctx.dataDir, tenantId, "createDashboard", { dashboard: body as Record<string, unknown>, via: "portal" }, tenantId);
      return res.applied ? Response.json({ data: { status: "applied", dashboardId: res.reportId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "create failed");
    }
    // /api/native/dashboard/writes/:id/apply|reject
    if (seg[0] === "writes" && seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject")) {
      const w = listPendingWrites(ctx.dataDir, tenantId).find((x) => x.id === seg[1]);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this dashboard action");
      if (seg[2] === "apply") {
        const res = executePendingDashboardWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
        if (!res.ok) return gateErrorStatus(res.reason);
        return Response.json({ data: { status: "applied", ptwId: res.ptwId, reportId: res.reportId, runId: res.runId, alreadyApplied: !!res.alreadyApplied } });
      }
      noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected", ptwId: w.id } });
    }
    // /api/native/dashboard/reports — create report
    if (seg[0] === "reports" && seg.length === 1) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return json400("body must be a JSON object");
      const res = submitDashboardWrite(ctx.dataDir, tenantId, "createReport", { report: body as Record<string, unknown>, via: "portal" }, tenantId);
      return res.applied ? Response.json({ data: { status: "applied", reportId: res.reportId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "create failed");
    }
    // /api/native/dashboard/reports/:id/{update,delete,run}
    if (seg[0] === "reports" && seg.length === 3 && RPT_RE.test(seg[1] ?? "")) {
      const reportId = seg[1]!;
      const sub = seg[2]!;
      if (sub === "update" || sub === "delete" || sub === "run") {
        let reqBody: DashboardWriteRequest;
        if (sub === "delete") {
          reqBody = { report: { id: reportId }, via: "portal" };
        } else {
          const body = await req.json().catch(() => null);
          if (!body || typeof body !== "object") return json400("body must be a JSON object");
          const b = body as Record<string, unknown>;
          if (sub === "run") {
            reqBody = { report: { id: reportId }, format: b.format === "csv" || b.format === "pdf" ? b.format : null, via: "portal" };
          } else {
            reqBody = { report: { id: reportId, ...b }, via: "portal" };
          }
        }
        const op = sub === "update" ? "updateReport" : sub === "delete" ? "deleteReport" : "runReport";
        const res = submitDashboardWrite(ctx.dataDir, tenantId, op, reqBody, tenantId);
        return res.applied ? Response.json({ data: { status: "applied", reportId: res.reportId, runId: res.runId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? `${sub} failed`);
      }
      return json404("Unknown native dashboard endpoint");
    }
    // /api/native/dashboard/schedules — create
    if (seg[0] === "schedules" && seg.length === 1) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return json400("body must be a JSON object");
      const res = submitDashboardWrite(ctx.dataDir, tenantId, "createSchedule", { schedule: body as Record<string, unknown>, via: "portal" }, tenantId);
      return res.applied ? Response.json({ data: { status: "applied", scheduleId: res.reportId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "create failed");
    }
    // /api/native/dashboard/schedules/:id/{update,activate,archive,delete}
    if (seg[0] === "schedules" && seg.length === 3 && SCH_RE.test(seg[1] ?? "")) {
      const scheduleId = seg[1]!;
      const sub = seg[2]!;
      if (sub === "update" || sub === "activate" || sub === "archive" || sub === "delete") {
        let reqBody: DashboardWriteRequest;
        if (sub === "update") {
          const body = await req.json().catch(() => null);
          if (!body || typeof body !== "object") return json400("body must be a JSON object");
          reqBody = { schedule: { id: scheduleId, ...(body as Record<string, unknown>) }, via: "portal" };
        } else {
          reqBody = { schedule: { id: scheduleId }, via: "portal" };
        }
        const op = sub === "update" ? "updateSchedule" : sub === "activate" ? "activateSchedule" : sub === "archive" ? "archiveSchedule" : "deleteSchedule";
        const res = submitDashboardWrite(ctx.dataDir, tenantId, op, reqBody, tenantId);
        return res.applied ? Response.json({ data: { status: "applied", scheduleId: res.reportId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? `${sub} failed`);
      }
      return json404("Unknown native dashboard endpoint");
    }
    // /api/native/dashboard/alerts — create alert rule
    if (seg[0] === "alerts" && seg.length === 1) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return json400("body must be a JSON object");
      const res = submitDashboardWrite(ctx.dataDir, tenantId, "createAlertRule", { alertRule: body as Record<string, unknown>, via: "portal" }, tenantId);
      return res.applied ? Response.json({ data: { status: "applied", alertRuleId: res.reportId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? "create failed");
    }
    // /api/native/dashboard/alerts/:id/{update,delete}
    if (seg[0] === "alerts" && seg.length === 3 && ALR_RE.test(seg[1] ?? "")) {
      const alertRuleId = seg[1]!;
      const sub = seg[2]!;
      if (sub === "update" || sub === "delete") {
        let reqBody: DashboardWriteRequest;
        if (sub === "update") {
          const body = await req.json().catch(() => null);
          if (!body || typeof body !== "object") return json400("body must be a JSON object");
          reqBody = { alertRule: { id: alertRuleId, ...(body as Record<string, unknown>) }, via: "portal" };
        } else {
          reqBody = { alertRule: { id: alertRuleId }, via: "portal" };
        }
        const op = sub === "update" ? "updateAlertRule" : "deleteAlertRule";
        const res = submitDashboardWrite(ctx.dataDir, tenantId, op, reqBody, tenantId);
        return res.applied ? Response.json({ data: { status: "applied", alertRuleId: res.reportId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? `${sub} failed`);
      }
      return json404("Unknown native dashboard endpoint");
    }
    // /api/native/dashboard/:id/{update,delete} — dashboard lifecycle
    if (seg.length === 2 && DSH_RE.test(seg[0] ?? "")) {
      const dashboardId = seg[0]!;
      const sub = seg[1]!;
      if (sub === "update" || sub === "delete") {
        let reqBody: DashboardWriteRequest;
        if (sub === "update") {
          const body = await req.json().catch(() => null);
          if (!body || typeof body !== "object") return json400("body must be a JSON object");
          reqBody = { dashboard: { id: dashboardId, ...(body as Record<string, unknown>) }, via: "portal" };
        } else {
          reqBody = { dashboard: { id: dashboardId }, via: "portal" };
        }
        const op = sub === "update" ? "updateDashboard" : "deleteDashboard";
        const res = submitDashboardWrite(ctx.dataDir, tenantId, op, reqBody, tenantId);
        return res.applied ? Response.json({ data: { status: "applied", dashboardId: res.reportId } }) : res.pending ? Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 }) : gateErrorStatus(res.error ?? `${sub} failed`);
      }
      return json404("Unknown native dashboard endpoint");
    }
    return json404("Unknown native dashboard endpoint");
  })();
}
/** AUTHED handler (prod-server wires this AFTER the session check). */
export function handleNativeDashboardsAuthed(req: Request, ctx: NativeDashboardCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch(() => Response.json({ error: "Internal error" }, { status: 500 }));
}
/** The background sweeper: fires due active schedules (called by prod-server
 *  on its interval; serialised there). Returns per-tenant activity counts. */
export function sweepDueDashboardSchedules(dataDir: string, now: Date = new Date()): { tenantsTouched: number; schedulesFired: number; runs: string[]; errors: string[] } {
  const tenants = new Set<string>();
  const fired: string[] = [];
  const errors: string[] = [];
  for (const { tenantId, schedule } of listAllSchedules(dataDir)) {
    if (schedule.status !== "active") continue;
    if (schedule.nextRunAt && new Date(schedule.nextRunAt).getTime() <= now.getTime()) {
      tenants.add(tenantId);
      const out = fireScheduleNow(dataDir, tenantId, schedule.id);
      if (out.ok && out.runId) fired.push(out.runId);
      else errors.push(out.error ?? "schedule fire failed");
    }
  }
  return { tenantsTouched: tenants.size, schedulesFired: fired.length, runs: fired, errors };
}
// ── Built-in typed events (Phase 1.1 registry pattern, 2.1–3.5) ─────────────
export function registerBuiltinNativeDashboardEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.dashboard.created",
    "native.dashboard.updated",
    "native.dashboard.deleted",
    "native.dashboard.report.created",
    "native.dashboard.report.updated",
    "native.dashboard.report.deleted",
    "native.dashboard.report.ran",
    "native.dashboard.schedule.created",
    "native.dashboard.schedule.updated",
    "native.dashboard.schedule.activated",
    "native.dashboard.schedule.archived",
    "native.dashboard.schedule.deleted",
    "native.dashboard.schedule.ran",
    "native.dashboard.alertrule.created",
    "native.dashboard.alertrule.updated",
    "native.dashboard.alertrule.deleted",
    "native.dashboard.alert.fired",
    "native.dashboard.alert.cleared",
    "native.dashboard.pending",
  ]) {
    registerNativeEventType(t, base);
  }
}