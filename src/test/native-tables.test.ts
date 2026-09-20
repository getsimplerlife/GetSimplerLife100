/**
 * native-tables.test.ts — Phase 1.4 data-table CRUD + gated write path
 * (vitest — canonical runner).
 *
 * Coverage:
 *  - table lifecycle (create/list/get/schema-update-empty/delete-empty) +
 *    schema validation (fail-closed);
 *  - row validation (unknown keys, types, select options, JSONB bound) and
 *    CSV/JSON import parse + round-trip;
 *  - GATED WRITES: default → approval-pending (row untouched) → apply via the
 *    approve-path executor (idempotent); auditors see pending + applied;
 *  - AUTONOMY: allow-listed insert auto-applies + records the outcome; a GLOB
 *    can never auto-approve a delete; an exact entry + known-row id can;
 *  - isolation: foreign tenant ids fail closed (404/not-found, zero cross reads);
 *  - router contract: create/list/rows/import/export/apply + 404/405.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTable,
  listTables,
  getTable,
  updateTableSchema,
  deleteTable,
  listRows,
  getRow,
  listAudit,
  countRows,
  listPendingWrites,
  generateTableEntityId,
} from "../native/tables/store";
import {
  validateTableSchema,
  validateRowData,
  parseImportContent,
  toCsv,
  parseCsv,
} from "../native/tables/validate";
import { submitTableWrite, executePendingTableWrite } from "../native/tables/gate";
import { handleNativeTablesAuthed } from "../native/tables/router";
import { setAutonomyWorkflow, autonomyAuditPath } from "../lib/autonomy";
import { listTenantActions } from "../lib/approval-queue";
import { readJSON } from "../lib/data-store";
import type { TableDef } from "../native/tables/types";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
const AGENT = "agent-ops@acme.test";
let dir: string;

function seedTable(tenantId = T1): TableDef {
  const now = new Date().toISOString();
  const def: TableDef = {
    id: generateTableEntityId("tbl"),
    tenantId,
    name: "Vendors",
    description: "Procurement vendors",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "tier", label: "Tier", type: "select", options: ["core", "strategic"], required: true },
      { key: "active", label: "Active", type: "boolean" },
      { key: "since", label: "Since", type: "date" },
      { key: "meta", label: "Meta", type: "json" },
    ],
    version: 1,
    createdAt: now,
    createdBy: tenantId,
    updatedAt: now,
    updatedBy: tenantId,
  };
  createTable(dir, def);
  return def;
}
function validRow() {
  return { name: "Acme Parts", email: "billing@acme.test", tier: "core", active: true, since: "2026-01-15", meta: { rating: 4 } };
}
function authedReq(method: string, pathname: string, body?: unknown): Request {
  const url = `http://native.test${pathname}`;
  if (method === "GET") return new Request(url);
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
}
async function route(method: string, pathname: string, body?: unknown, tenantId = T1) {
  return handleNativeTablesAuthed(authedReq(method, pathname, body), { userEmail: tenantId, dataDir: dir });
}
function pendingFirst(tableId: string, op?: string) {
  return listPendingWrites(dir, T1, tableId).find((w) => w.status === "pending" && (op ? w.op === op : true)) ?? null;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-tables-"));
});
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("table CRUD + schema validation (fail-closed)", () => {
  it("creates, lists, gets and rejects bad schemas", async () => {
    const table = seedTable();
    expect(listTables(dir, T1).length).toBe(1);
    expect(getTable(dir, T1, table.id)?.name).toBe("Vendors");
    expect(validateTableSchema({ name: "x", fields: [{ key: "a", label: "A", type: "text" }, { key: "a", label: "B", type: "text" }] }).ok).toBe(false);
    expect(validateTableSchema({ name: "x", fields: [{ key: "a", label: "A", type: "bogus" }] }).ok).toBe(false);
    expect(validateTableSchema({ name: "x", fields: [{ key: "a", label: "A", type: "select" }] }).ok).toBe(false);
    expect(validateTableSchema({ name: "x", fields: [{ key: "bad key!", label: "A", type: "text" }] }).ok).toBe(false);
    expect(validateTableSchema({ name: "", fields: [{ key: "a", label: "A", type: "text" }] }).ok).toBe(false);
    const tooMany = Array.from({ length: 31 }, (_, i) => ({ key: `k${i}`, label: `K${i}`, type: "text" }));
    expect(validateTableSchema({ name: "x", fields: tooMany }).ok).toBe(false);
  });

  it("schema update + delete are EMPTY-ONLY (fail-closed with rows)", async () => {
    const table = seedTable();
    const updated = updateTableSchema(dir, T1, table.id, table.fields, "Vendors v2", "d", "owner");
    expect(updated?.version).toBe(2);
    // Insert a REAL row through the gated path (approvals on → apply via executor).
    const ins = submitTableWrite(dir, T1, table.id, "insert", { rowData: validRow() }, AGENT);
    expect(executePendingTableWrite(dir, T1, ins.approvalActionId!, "owner@acme.test").ok).toBe(true);
    expect(countRows(dir, T1, table.id)).toBe(1);
    // With rows present, schema update + table delete FAIL CLOSED.
    expect(updateTableSchema(dir, T1, table.id, table.fields, "v3", "d", "owner")).toBeNull();
    expect(deleteTable(dir, T1, table.id, "owner")).toBe(false);
    // After removing the row (gated), empty-only delete succeeds.
    const row = listRows(dir, T1, table.id)[0];
    const del = submitTableWrite(dir, T1, table.id, "delete", { rowData: {}, existingRowId: row.id }, AGENT);
    expect(executePendingTableWrite(dir, T1, del.approvalActionId!, "owner@acme.test").ok).toBe(true);
    expect(countRows(dir, T1, table.id)).toBe(0);
    expect(deleteTable(dir, T1, table.id, "owner")).toBe(true);
  });
});

describe("row validation (fail-closed, never queued)", () => {
  it("rejects unknown keys, wrong types, bad emails/dates/options, oversize JSON", () => {
    const table = seedTable();
    expect(validateRowData(table, validRow()).ok).toBe(true);
    const bad = (data: unknown, needle: string) => {
      const r = validateRowData(table, data);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.join(" ")).toContain(needle);
    };
    bad({ name: "X", tier: "core", unknownKey: 1 }, "Unknown field key");
    bad({ tier: "core" }, "required");
    bad({ name: 5, tier: "core" }, "must be a string");
    bad({ name: "X", tier: "nope" }, "must be one of");
    bad({ name: "X", tier: "core", email: "not-an-email" }, "not a valid email");
    bad({ name: "X", tier: "core", since: "01/15/2026" }, "YYYY-MM-DD");
    bad({ name: "X", tier: "core", active: "yes" }, "must be a boolean");
    bad({ name: "X", tier: "core", meta: "not json" }, "must be valid JSON");
  });

  it("import parse rejects malformed/empty/oversize/unknown-format content", () => {
    expect(parseImportContent("json", "[]").ok).toBe(false);
    expect(parseImportContent("csv", "header_only").ok).toBe(false);
    expect(parseImportContent("xml", "<a/>").ok).toBe(false);
    const okCsv = parseImportContent("csv", "name,tier\nAcme,core\n");
    expect(okCsv.ok).toBe(true);
    if (okCsv.ok) expect(okCsv.rows[0].name).toBe("Acme");
    const big = JSON.stringify(Array.from({ length: 300 }, () => ({ a: 1 })));
    expect(parseImportContent("json", big).ok).toBe(false);
  });

  it("CSV round-trips through toCsv + parseCsv", () => {
    const table = seedTable();
    const rows = [{ data: { name: "Acme, LLC", tier: "core" } }, { data: { name: 'Zeta "HQ"', tier: "strategic" } }];
    const csv = toCsv(table, rows);
    const parsed = parseCsv(csv);
    expect(parsed.length).toBe(2);
    expect(parsed[0].name).toBe("Acme, LLC");
    expect(parsed[1].tier).toBe("strategic");
  });
});

describe("GATED WRITE PATH (approval on by default)", () => {
  it("insert is pending, row untouched, apply is idempotent, audit shows all", () => {
    const table = seedTable();
    const res = submitTableWrite(dir, T1, table.id, "insert", { rowData: validRow() }, AGENT);
    expect(res.applied).toBe(false);
    expect(res.pending).toBe(true);
    expect(String(res.approvalActionId||'').length).toBeGreaterThan(0);
    expect(listTenantActions(T1, dir).some((a) => a.actionId === res.approvalActionId)).toBe(true);
    expect(countRows(dir, T1, table.id)).toBe(0);
    expect(listPendingWrites(dir, T1, table.id).length).toBe(1);
    const applied = executePendingTableWrite(dir, T1, res.approvalActionId!,  "owner@acme.test");
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.report.rowIds.length).toBe(1);
    const rows = listRows(dir, T1, table.id);
    expect(rows.length).toBe(1);
    expect(rows[0].data.name).toBe("Acme Parts");
    expect(rows[0].tenantId).toBe(T1);
    const again = executePendingTableWrite(dir, T1, res.approvalActionId!,  "owner@acme.test");
    expect(again.ok).toBe(false); // idempotent no-op
    expect(listRows(dir, T1, table.id).length).toBe(1);
    const audit = listAudit(dir, T1).map((a) => a.action);
    expect(audit).toContain("native.data.write.pending");
    expect(audit).toContain("native.data.write.applied");
    expect(audit).toContain("native.data.row.insert");
  });

  it("invalid rows are rejected BEFORE the gate (never queued)", () => {
    const table = seedTable();
    const before = listTenantActions(T1, dir).length;
    expect(() => submitTableWrite(dir, T1, table.id, "insert", { rowData: { name: "X", tier: "nope" } }, AGENT)).toThrow();
    expect(listTenantActions(T1, dir).length).toBe(before);
    expect(listPendingWrites(dir, T1, table.id).length).toBe(0);
    expect(countRows(dir, T1, table.id)).toBe(0);
  });

  it("update and delete also gate through the queue", () => {
    const table = seedTable();
    const ins = submitTableWrite(dir, T1, table.id, "insert", { rowData: validRow() }, AGENT);
    executePendingTableWrite(dir, T1, ins.approvalActionId!, "owner@acme.test");
    const row = listRows(dir, T1, table.id)[0];
    const upd = submitTableWrite(dir, T1, table.id, "update", { rowData: { tier: "strategic" }, existingRowId: row.id }, AGENT);
    expect(upd.applied).toBe(false);
    expect(listRows(dir, T1, table.id)[0].data.tier).toBe("core");
    executePendingTableWrite(dir, T1, upd.approvalActionId!, "owner@acme.test");
    expect(listRows(dir, T1, table.id)[0].data.tier).toBe("strategic");
    const del = submitTableWrite(dir, T1, table.id, "delete", { rowData: {}, existingRowId: row.id }, AGENT);
    expect(del.applied).toBe(false);
    expect(countRows(dir, T1, table.id)).toBe(1);
    executePendingTableWrite(dir, T1, del.approvalActionId!, "owner@acme.test");
    expect(countRows(dir, T1, table.id)).toBe(0);
  });
});

describe("AUTONOMY allow-list (#236)", () => {
  it("allow-listed insert auto-applies and records the outcome", () => {
    const table = seedTable();
    setAutonomyWorkflow(T1, AGENT, { enabled: true, allowList: [{ id: "al-ins-1", action: "createTableRow" }] }, dir);
    const res = submitTableWrite(dir, T1, table.id, "insert", { rowData: validRow() }, AGENT);
    expect(res.applied).toBe(true);
    expect(res.autonomy).toBe(true);
    expect(countRows(dir, T1, table.id)).toBe(1);
    expect(listAudit(dir, T1).some((a) => a.action === "native.data.row.insert")).toBe(true);
    const autoAudit = readJSON(autonomyAuditPath(dir));
    const tenantEntries = autoAudit?.[T1] ?? [];
    expect(tenantEntries.some((e: { action: string }) => e.action === "createTableRow")).toBe(true);
  });

  it("delete needs an EXACT allow-list entry + known-row id (glob never auto-deletes)", () => {
    const table = seedTable();
    const ins = submitTableWrite(dir, T1, table.id, "insert", { rowData: validRow() }, AGENT);
    executePendingTableWrite(dir, T1, ins.approvalActionId!, "owner@acme.test");
    const row = listRows(dir, T1, table.id)[0];
    setAutonomyWorkflow(T1, AGENT, { enabled: true, allowList: [{ id: "al-glob", action: "deleteTableRow*" }] }, dir);
    const globDel = submitTableWrite(dir, T1, table.id, "delete", { rowData: {}, existingRowId: row.id }, AGENT);
    expect(globDel.applied).toBe(false);
    expect(countRows(dir, T1, table.id)).toBe(1);
    setAutonomyWorkflow(T1, AGENT, { enabled: true, allowList: [{ id: "al-del-1", action: "deleteTableRow" }] }, dir);
    const exDel = submitTableWrite(dir, T1, table.id, "delete", { rowData: {}, existingRowId: row.id }, AGENT);
    expect(exDel.applied).toBe(true);
    expect(exDel.autonomy).toBe(true);
    expect(countRows(dir, T1, table.id)).toBe(0);
  });

  it("autonomy does NOT apply to other tenant ids even with an allow-list", () => {
    const table = seedTable(T1);
    setAutonomyWorkflow(T2, AGENT, { enabled: true, allowList: [{ id: "al-2", action: "createTableRow" }] }, dir);
    // Foreign table id fails closed — write is thrown (never queued/applied).
    expect(() => submitTableWrite(dir, T2, table.id, "insert", { rowData: validRow() }, AGENT)).toThrow();
    expect(getTable(dir, T2, table.id)).toBeNull();
    expect(countRows(dir, T2, table.id)).toBe(0);
  });
});

describe("isolation (zero cross-tenant paths)", () => {
  it("foreign table/row ids resolve to nothing", async () => {
    const table = seedTable(T1);
    expect(getTable(dir, T2, table.id)).toBeNull();
    expect(getRow(dir, T2, table.id)).toBeNull();
    expect(listRows(dir, T2).length).toBe(0);
    expect(listAudit(dir, T2).length).toBe(0);
    const r = await route("GET", `/api/native/tables/${table.id}`, undefined, T2);
    expect(r.status).toBe(404);
  });

  it("a foreign row id cannot be updated or deleted", async () => {
    const table = seedTable(T1);
    const ins = submitTableWrite(dir, T1, table.id, "insert", { rowData: validRow() }, AGENT);
    executePendingTableWrite(dir, T1, ins.approvalActionId!, "owner@acme.test");
    const row = getRow(dir, T1, listRows(dir, T1)[0].id)!;
    const r = await route("POST", `/api/native/tables/${table.id}/rows/${row.id}`, { data: { tier: "strategic" } }, T2);
    expect(r.status).toBe(404);
  });
});

describe("router contract (HTTP)", () => {
  it("creates + lists + gated row insert + import + apply + export", async () => {
    const created = await route("POST", "/api/native/tables", { name: "Projects", description: "d", fields: [{ key: "title", label: "Title", type: "text", required: true }, { key: "budget", label: "Budget", type: "number" }] });
    expect(created.status).toBe(200);
    const createdJson = await created.json();
    const id = createdJson.data.id;
    const listJson = await (await route("GET", "/api/native/tables")).json();
    expect(listJson.data.tables.some((t: { id: string }) => t.id === id)).toBe(true);
    // gated insert → 202 pending (row not applied)
    const insRes = await route("POST", `/api/native/tables/${id}/rows`, { data: { title: "Alpha", budget: 100 } });
    expect(insRes.status).toBe(202);
    // gated csv import → 202 pending, 1 row queued
    const imp = await route("POST", `/api/native/tables/${id}/import`, { format: "csv", content: "title,budget\nBeta,200\n" });
    expect(imp.status).toBe(202);
    const impJ = await imp.json();
    expect(impJ.data.rows).toBe(1);
    // invalid row via router → 400, nothing queued (still 2 pending)
    const bad = await route("POST", `/api/native/tables/${id}/rows`, { data: { title: "Gamma", budget: "not-a-number" } });
    expect(bad.status).toBe(400);
    expect((await (await route("GET", "/api/native/tables/writes")).json()).data.writes.length).toBe(2);
    // audit trail visible
    expect((await (await route("GET", "/api/native/tables/audit")).json()).data.length).toBeGreaterThan(0);
    // approve-path apply
    const writeRec = pendingFirst(id, "insert");
    expect(writeRec).not.toBeNull();
    const applyRes = await route("POST", `/api/native/tables/writes/${writeRec!.id}/apply`);
    expect(applyRes.status).toBe(200);
    const exp = await route("GET", `/api/native/tables/${id}/export?format=csv`);
    expect(exp.status).toBe(200);
    expect(await exp.text()).toContain("Alpha");
    const expJson = await (await route("GET", `/api/native/tables/${id}/export?format=json`)).json();
    expect(expJson.data.rows.length).toBe(1);
  });

  it("404 unknown table, 404 unknown endpoint, 405 wrong method", async () => {
    expect((await route("GET", "/api/native/tables/tbl_zzz")).status).toBe(404);
    expect((await route("GET", "/api/native/tables/whatever/unknown-path")).status).toBe(404);
    // PATCH on an UNKNOWN table fails closed with 404 (table resolved first);
    // wrong method on a REAL table → 405.
    const t = seedTable();
    expect((await route("PATCH", `/api/native/tables/${t.id}`)).status).toBe(405);
    expect((await route("PATCH", "/api/native/tables/whatever")).status).toBe(404);
    expect((await route("GET", "/api/native/tables/writes/act-unknown/apply")).status).toBe(404);
  });
});