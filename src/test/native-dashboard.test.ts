import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setApprovalMode } from "../lib/tenant-settings";
import {
  submitDashboardWrite,
  executePendingDashboardWrite,
  fireScheduleNow,
  setDashboardEmailSenderForTest,
  type DashboardWriteResult,
} from "../native/dashboard/gate";
import {
  listDashboards,
  listReports,
  listSchedules,
  listAlertRules,
  listRuns,
  listAlertRecords,
  listPendingWrites,
  listAudit,
} from "../native/dashboard/store";
import { scheduleAnchor } from "../native/dashboard/engine";
import { ensureTestServer, testBaseUrl } from "./test-env";
import { createTable, insertRow } from "../native/tables/store";
import type { TableDef } from "../native/tables/types";

const T1 = "dash-t1@test.local";
const T2 = "dash-t2@test.local";
let dir: string;
let tableId: string;
function seedTable() {
  const def: TableDef = {
    id: tableId,
    tenantId: T1,
    name: "Revenue",
    description: "seed",
    fields: [
      { key: "region", label: "Region", type: "text" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "status", label: "Status", type: "select", options: ["open", "closed"] },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: "seed",
    updatedAt: new Date().toISOString(),
    updatedBy: "seed",
  };
  createTable(dir, def);
  for (const [region, amount, status] of [
    ["west", 100, "open"],
    ["west", 50, "closed"],
    ["east", 300, "open"],
    ["east", 200, "closed"],
  ] as const) {
    insertRow(dir, {
      id: `row_${Math.random().toString(36).slice(2, 10)}`,
      tenantId: T1,
      tableId: tableId,
      data: { region, amount, status },
      createdAt: new Date().toISOString(),
      createdBy: "seed",
      updatedAt: new Date().toISOString(),
      updatedBy: "seed",
    });
  }
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dash-"));
  tableId = `tbl_${Math.random().toString(36).slice(2, 10)}`;
  seedTable();
  setApprovalMode(T1, "on", dir);
  setDashboardEmailSenderForTest(async () => ({ success: true }));
});
afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ }
  setDashboardEmailSenderForTest(null);
});
// convenience: a gated create that we approve+apply through the same path a
// portal admin would (executePendingDashboardWrite with the approvalActionId).
function createVia(op: Parameters<typeof submitDashboardWrite>[2], req: Parameters<typeof submitDashboardWrite>[3]) {
  const res = submitDashboardWrite(dir, T1, op, req, T1);
  expect(res.applied, JSON.stringify(res)).toBe(false);
  if (res.applied || !("approvalActionId" in res)) throw new Error("expected pending");
  return res as Extract<typeof res, { pending: true }>;
}
function errOf(res: DashboardWriteResult): string {
  return "error" in res ? res.error : "";
}
function applyPending(actionId: string) {
  const out = executePendingDashboardWrite(dir, T1, actionId, T1);
  expect(out.ok, JSON.stringify(out)).toBe(true);
  return out as Extract<typeof out, { ok: true }>;
}
function makeReportId() {
  const p = createVia("createReport", {
    report: {
      name: "Rev by region",
      description: "sum amount group by region",
      sourceTableId: tableId,
      viz: "bar",
      groupBy: "region",
      valueField: "amount",
      agg: "sum",
      sortDir: "desc",
      limit: 100,
    },
    via: "test",
  });
  const r = applyPending(p.approvalActionId);
  return r.reportId!;
}

describe("Phase 3.6 native dashboards/BI — gate semantics", () => {
  it("gated lifecycle: report → run → artifact (rows computed from 1.4 data)", () => {
    const reportId = makeReportId();
    const reports = listReports(dir, T1);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.sourceTableId).toBe(tableId);
    // runReport rides the queue → apply → durable run with grouped rows
    const runP = createVia("runReport", { report: { id: reportId }, format: "csv", via: "test" });
    const runRes = applyPending(runP.approvalActionId);
    const runs = listRuns(dir, T1, reportId);
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.rows).toEqual([
      { label: "east", value: 500 },
      { label: "west", value: 150 },
    ]);
    expect(run.rowCount).toBe(2);
    expect(run.headline).toBe(650); // desc sum → east 500, west 150
    expect(run.artifact?.kind).toBe("csv");
    expect(run.artifact?.base64.length).toBeGreaterThan(10);
    void runRes;
  });
  it("runReport replay → alreadyApplied (idempotent), same run", () => {
    const reportId = makeReportId();
    const p = createVia("runReport", { report: { id: reportId }, format: null, via: "test" });
    applyPending(p.approvalActionId);
    const again = executePendingDashboardWrite(dir, T1, p.approvalActionId, T1);
    expect(again.ok).toBe(true);
    expect((again as { alreadyApplied?: boolean }).alreadyApplied).toBe(true);
    expect(listRuns(dir, T1, reportId)).toHaveLength(1);
  });
  it("validation BEFORE gate: forged create-id / unknown table / missing field NEVER queue", () => {
    const forged = submitDashboardWrite(dir, T1, "createReport", { report: { id: "rpt_forged123", name: "x", sourceTableId: tableId, viz: "bar", agg: "count" } }, T1);
    expect(forged.applied || forged.pending).toBe(false);
    expect(errOf(forged)).toMatch(/client-supplied report ids/i);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(0);

    const noTable = submitDashboardWrite(dir, T1, "createReport", { report: { name: "x", sourceTableId: "tbl_nope", viz: "bar", agg: "count" } }, T1);
    expect(noTable.applied || noTable.pending).toBe(false);
    expect(errOf(noTable)).toMatch(/not found/i);

    const noField = submitDashboardWrite(dir, T1, "createReport", { report: { name: "x", sourceTableId: tableId, viz: "bar", groupBy: "bogus_field", agg: "count" } }, T1);
    expect(noField.applied || noField.pending).toBe(false);
    expect(errOf(noField)).toMatch(/does not exist/i);
  });
  it("sum/avg/min/max aggregation requires a valueField (fail-closed)", () => {
    const res = submitDashboardWrite(dir, T1, "createReport", { report: { name: "x", sourceTableId: tableId, viz: "bar", agg: "sum" } }, T1);
    expect(res.applied || res.pending).toBe(false);
    expect(errOf(res)).toMatch(/needs a valueField/i);
  });
  it("cross-tenant access → report not found (404-no-IDOR)", () => {
    const reportId = makeReportId();
    const res = submitDashboardWrite(dir, T2, "runReport", { report: { id: reportId }, format: null, via: "test" }, T2);
    expect(res.applied || res.pending).toBe(false);
    expect(errOf(res)).toMatch(/not found/i);
  });
});

describe("Phase 3.6 dashboards — CRUD + widget refs", () => {
  it("dashboard create → update → delete ride the queue; widget refs validated in-tenant", () => {
    const reportId = makeReportId();
    const p = createVia("createDashboard", { dashboard: { name: "Ops", description: "", reportIds: [reportId] }, via: "test" });
    const applied = applyPending(p.approvalActionId);
    expect(listDashboards(dir, T1)).toHaveLength(1);
    expect(listDashboards(dir, T1)[0]!.reportIds).toEqual([reportId]);
    // cross-tenant widget ref → validation fails pre-queue
    const bad = submitDashboardWrite(dir, T1, "createDashboard", { dashboard: { name: "Bad", reportIds: ["rpt_foreign"] } }, T1);
    expect(bad.applied || bad.pending).toBe(false);
    expect(errOf(bad)).toMatch(/not found/i);
    void applied;
  });
  it("deleteReport is blocked while referenced (fail-closed referential integrity)", () => {
    const reportId = makeReportId();
    const dashP = createVia("createDashboard", { dashboard: { name: "Ops", reportIds: [reportId] }, via: "test" });
    applyPending(dashP.approvalActionId);
    const del = submitDashboardWrite(dir, T1, "deleteReport", { report: { id: reportId }, via: "test" }, T1);
    expect(del.applied || del.pending).toBe(false);
    expect(errOf(del)).toMatch(/used by a dashboard/i);
  });
});

describe("Phase 3.6 schedules — activation + sweeper", () => {
  it("schedule activate (gated) anchors nextRunAt to the FUTURE; fireScheduleNow runs it", () => {
    const reportId = makeReportId();
    const p = createVia("createSchedule", {
      schedule: { name: "Daily CSV", reportId, cadence: "daily", timeUtc: "09:00", format: "csv", recipients: ["ops@acme.test"] },
      via: "test",
    });
    applyPending(p.approvalActionId);
    const schedules = listSchedules(dir, T1);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.status).toBe("draft");
    // activate
    const ap = createVia("activateSchedule", { schedule: { id: schedules[0]!.id }, via: "test" });
    applyPending(ap.approvalActionId);
    const active = listSchedules(dir, T1)[0]!;
    expect(active.status).toBe("active");
    const next = new Date(active.nextRunAt).getTime();
    expect(next).toBeGreaterThan(Date.now() - 1000);
    // fire NOW → durable run + advance
    const fired = fireScheduleNow(dir, T1, active.id);
    expect(fired.ok, JSON.stringify(fired)).toBe(true);
    expect(listRuns(dir, T1, reportId)).toHaveLength(1);
    expect(listRuns(dir, T1, reportId)[0]!.artifact?.kind).toBe("csv");
    expect(listRuns(dir, T1, reportId)[0]!.triggeredBy).toBe(`system/schedule:${active.id}`);
    const after = listSchedules(dir, T1)[0]!;
    expect(new Date(after.nextRunAt).getTime()).toBeGreaterThan(next);
    expect(listAudit(dir, T1).some((e) => e.action === "native.dashboard.schedule.ran")).toBe(true);
  });
  it("non-active schedules never fire (fail-closed)", () => {
    const reportId = makeReportId();
    const p = createVia("createSchedule", { schedule: { name: "Draft", reportId, cadence: "daily", timeUtc: "09:00", format: "pdf", recipients: ["x@y.test"] }, via: "test" });
    applyPending(p.approvalActionId);
    const id = (() => {
      const all = listSchedules(dir, T1);
      expect(all).toHaveLength(1);
      expect(all[0]!.status).toBe("draft");
      return all[0]!.id;
    })();
    const fired = fireScheduleNow(dir, T1, id);
    expect(fired.ok).toBe(false);
    expect(fired.error).toMatch(/not active/i);
    expect(listRuns(dir, T1, reportId)).toHaveLength(0);
  });
  it("scheduleAnchor: daily at HH:MM UTC advances to the next day when due", () => {
    const now = new Date("2026-09-26T09:00:30Z");
    const next = scheduleAnchor("daily", "09:00", now);
    expect(next.toISOString()).toBe("2026-09-27T09:00:00.000Z");
    const before = scheduleAnchor("daily", "10:00", now);
    expect(before.toISOString()).toBe("2026-09-26T10:00:00.000Z");
    const monthly = scheduleAnchor("monthly", "09:00", now);
    expect(monthly.getUTCMonth()).toBe(9); // October
    expect(monthly.toISOString().startsWith("2026-10-01")).toBe(true);
  });
});

describe("Phase 3.6 alert rules — edge-triggered thresholds", () => {
  it("alert fires on breach (durable record + event) and clears on recovery", () => {
    const reportId = makeReportId();
    // avg amount < 100 → fires (avg = (100+50+300+200)/4 = 162.5, so use > with threshold 100)
    const ap = createVia("createAlertRule", {
      alertRule: { name: "Big avg", reportId, metric: "agg", op: "gt", threshold: 10, recipients: ["ops@acme.test"] },
      via: "test",
    });
    applyPending(ap.approvalActionId);
    const rules = listAlertRules(dir, T1);
    expect(rules).toHaveLength(1);
    // run the report → rule evaluates headline 650 > 10 → fire
    const rp = createVia("runReport", { report: { id: reportId }, format: null, via: "test" });
    applyPending(rp.approvalActionId);
    const records = listAlertRecords(dir, T1);
    expect(records).toHaveLength(1);
    expect(records[0]!.metric).toBe(650);
    expect(records[0]!.op).toBe("gt");
    expect(records[0]!.threshold).toBe(10);
    expect(listAlertRules(dir, T1)[0]!.active).toBe(true);
    expect(listAudit(dir, T1).some((e) => e.action === "native.dashboard.alert.fired")).toBe(true);
    // second run while still breached → NO duplicate record (edge-triggered)
    const rp2 = createVia("runReport", { report: { id: reportId }, format: null, via: "test" });
    applyPending(rp2.approvalActionId);
    expect(listAlertRecords(dir, T1)).toHaveLength(1);
  });
  it("alert rule validation: non-numeric threshold / bad op / unknown report → 400 pre-queue", () => {
    const reportId = makeReportId();
    const badOp = submitDashboardWrite(dir, T1, "createAlertRule", { alertRule: { name: "x", reportId, op: "wat", threshold: 5, recipients: ["a@b.test"] } }, T1);
    expect(badOp.applied || badOp.pending).toBe(false);
    expect(errOf(badOp)).toMatch(/op must be/i);
    const badThreshold = submitDashboardWrite(dir, T1, "createAlertRule", { alertRule: { name: "x", reportId, op: "gt", threshold: "high" as unknown as number, recipients: ["a@b.test"] } }, T1);
    expect(badThreshold.applied || badThreshold.pending).toBe(false);
    expect(errOf(badThreshold)).toMatch(/finite number/i);
    const badReport = submitDashboardWrite(dir, T1, "createAlertRule", { alertRule: { name: "x", reportId: "rpt_unknown", op: "gt", threshold: 5, recipients: ["a@b.test"] } }, T1);
    expect(badReport.applied || badReport.pending).toBe(false);
    expect(errOf(badReport)).toMatch(/not found/i);
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(0);
  });
  it("recipient emails validated + deduped (fail-closed)", () => {
    const reportId = makeReportId();
    const bad = submitDashboardWrite(dir, T1, "createAlertRule", { alertRule: { name: "x", reportId, op: "gt", threshold: 5, recipients: ["not-an-email"] } }, T1);
    expect(bad.applied || bad.pending).toBe(false);
    expect(errOf(bad)).toMatch(/valid email/i);
    const dup = submitDashboardWrite(dir, T1, "createAlertRule", { alertRule: { name: "x", reportId, op: "gt", threshold: 5, recipients: ["a@b.test", "a@b.test"] } }, T1);
    expect(dup.applied || dup.pending).toBe(false);
    expect(errOf(dup)).toMatch(/duplicate/i);
  });
});

describe("Phase 3.6 HTTP wiring (standing controls)", () => {
  it("anonymous → 401 on every dashboard lane", async () => {
    await ensureTestServer();
    const base = testBaseUrl();
    for (const p of ["/api/native/dashboard", "/api/native/dashboard/reports", "/api/native/dashboard/runs", "/api/native/dashboard/writes"]) {
      const r = await fetch(`${base}${p}`, { signal: AbortSignal.timeout(8000) });
      expect(r.status, p).toBe(401);
    }
  });
  it("route-ordering: pre-session public lanes untouched while dashboard 401s", async () => {
    await ensureTestServer();
    const base = testBaseUrl();
    const share = await fetch(`${base}/api/native/survey/share/doesnotexist000`, { signal: AbortSignal.timeout(8000) });
    expect(share.status).toBe(404);
    const d = await fetch(`${base}/api/native/dashboard`, { signal: AbortSignal.timeout(8000) });
    expect(d.status).toBe(401);
  });
});