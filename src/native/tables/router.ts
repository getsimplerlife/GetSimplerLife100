/**
 * native/tables/router.ts — Phase 1.4 native capability: DATA-TABLE CRUD +
 * GATED WRITE PATH (HTTP layer). Authed tenant-scoped routes:
 *
 *   GET    /api/native/tables                    list tables (+row/pending counts)
 *   POST   /api/native/tables                    create a table (schema validated)
 *   GET    /api/native/tables/audit              immutable native.data.* audit
 *   GET    /api/native/tables/writes             pending + applied writes (auditors see every write)
 *   POST   /api/native/tables/writes/:aid/apply  APPROVE-path executor (idempotent) — applies the
 *                                                stored pending write when the owner decides
 *   GET    /api/native/tables/:id                table definition + counts
 *   POST   /api/native/tables/:id                update schema (EMPTY table only — fail-closed)
 *   DELETE /api/native/tables/:id                delete table (EMPTY only)
 *   GET    /api/native/tables/:id/rows           list rows (tenant-scoped)
 *   POST   /api/native/tables/:id/rows           GATED insert
 *   POST   /api/native/tables/:id/rows/:rowId    GATED update
 *   DELETE /api/native/tables/:id/rows/:rowId    GATED delete
 *   GET    /api/native/tables/:id/export?format=csv|json
 *   POST   /api/native/tables/:id/import         { format, content } — GATED bulk import
 *
 * Every mutating op flows through src/native/tables/gate.ts: invalid rows are
 * rejected BEFORE the gate (never queued); valid writes ride the Approval
 * Queue (#164) by default; allow-listed autonomy (#236) auto-applies against
 * explicit action ids only. All mutations append immutable native.data.*
 * audit entries. Tenant isolation: every read/write is `{ [tenantId]: ... }`
 * keyed — a foreign table/row id → 404 (fail-closed).
 */
import { MAX_TABLES_PER_TENANT, MAX_TABLE_NAME, MAX_TABLE_DESCRIPTION, MAX_IMPORT_ROWS, type TableDef } from "./types";
import {
  countRows,
  listTables,
  getTable,
  createTable,
  updateTableSchema,
  deleteTable,
  listRows,
  getRow,
  listAudit,
  listPendingWrites,
  getPendingWrite,
  generateTableEntityId,
} from "./store";
import { validateTableSchema, parseImportContent, toCsv } from "./validate";
import { submitTableWrite, executePendingTableWrite } from "./gate";

export interface NativeTablesCtx {
  userEmail: string;
  dataDir: string;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Body must be a JSON object");
  return parsed as Record<string, unknown>;
}

function publicTable(dataDir: string, tenantId: string, t: TableDef) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    fields: t.fields,
    version: t.version,
    rows: countRows(dataDir, tenantId, t.id),
    pending: listPendingWrites(dataDir, tenantId, t.id).filter((w) => w.status === "pending").length,
    createdAt: t.createdAt,
    createdBy: t.createdBy,
    updatedAt: t.updatedAt,
    updatedBy: t.updatedBy,
  };
}

async function route(req: Request, ctx: NativeTablesCtx): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  const tenantId = ctx.userEmail;
  const P = (name: string) => url.searchParams.get(name);
  const actor = ctx.userEmail;
  const json400 = (error: string) => Response.json({ error }, { status: 400 });

  // GET /api/native/tables
  if (pathname === "/api/native/tables" && req.method === "GET") {
    const tables = listTables(ctx.dataDir, tenantId).map((t) => publicTable(ctx.dataDir, tenantId, t));
    return Response.json({ data: { tables } });
  }
  // GET /api/native/tables/audit
  if (pathname === "/api/native/tables/audit" && req.method === "GET") {
    return Response.json({ data: listAudit(ctx.dataDir, tenantId) });
  }
  // GET /api/native/tables/writes
  if (pathname === "/api/native/tables/writes" && req.method === "GET") {
    return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId) } });
  }
  // POST /api/native/tables/writes/:aid/apply — APP decision executor
  const applyMatch = pathname.match(/^\/api\/native\/tables\/writes\/([A-Za-z0-9_-]+)\/apply$/);
  if (applyMatch && req.method === "POST") {
    const ptw = getPendingWrite(ctx.dataDir, tenantId, applyMatch[1]);
    if (!ptw) return Response.json({ error: "Pending write not found" }, { status: 404 });
    const res = executePendingTableWrite(ctx.dataDir, tenantId, ptw.approvalActionId, actor);
    if (!res.ok) return Response.json({ error: res.reason }, { status: 409 });
    return Response.json({ data: { applied: true, op: res.report.op, rowIds: res.report.rowIds } });
  }
  // POST /api/native/tables — create
  if (pathname === "/api/native/tables" && req.method === "POST") {
    const b = parseJsonObject(await req.text());
    if (listTables(ctx.dataDir, tenantId).length >= MAX_TABLES_PER_TENANT) return json400(`Table limit reached (${MAX_TABLES_PER_TENANT})`);
    const v = validateTableSchema({ name: b.name, description: b.description, fields: b.fields });
    if (!v.ok) return json400(v.error);
    const now = new Date().toISOString();
    const table: TableDef = {
      id: generateTableEntityId("tbl"),
      tenantId,
      name: String(b.name).trim().slice(0, MAX_TABLE_NAME),
      description: typeof b.description === "string" ? b.description.slice(0, MAX_TABLE_DESCRIPTION) : "",
      fields: v.fields,
      version: 1,
      createdAt: now,
      createdBy: tenantId,
      updatedAt: now,
      updatedBy: tenantId,
    };
    createTable(ctx.dataDir, table);
    return Response.json({ data: { id: table.id, name: table.name } });
  }
  // ── /api/native/tables/:id ... ──
  const idMatch = pathname.match(/^\/api\/native\/tables\/([A-Za-z0-9_-]+)((?:\/[a-z-]+){0,2})$/);
  if (!idMatch) return Response.json({ error: "Unknown native tables endpoint" }, { status: 404 });
  const tableId = idMatch[1];
  const rest = idMatch[2] ?? "";
  const table = getTable(ctx.dataDir, tenantId, tableId);
  if (!table) return Response.json({ error: "Table not found" }, { status: 404 });

  // GET /api/native/tables/:id
  if (rest === "" && req.method === "GET") {
    return Response.json({ data: publicTable(ctx.dataDir, tenantId, table) });
  }
  // POST /api/native/tables/:id — schema update (EMPTY only)
  if (rest === "" && req.method === "POST") {
    const b = parseJsonObject(await req.text());
    const v = validateTableSchema({ name: b.name ?? table.name, description: b.description ?? table.description, fields: b.fields ?? table.fields });
    if (!v.ok) return json400(v.error);
    if (countRows(ctx.dataDir, tenantId, tableId) > 0) return json400("Schema update is only allowed on an empty table");
    const updated = updateTableSchema(ctx.dataDir, tenantId, tableId, v.fields, String(b.name ?? table.name).trim().slice(0, MAX_TABLE_NAME), typeof b.description === "string" ? b.description.slice(0, MAX_TABLE_DESCRIPTION) : table.description, actor);
    if (!updated) return Response.json({ error: "Table not found" }, { status: 404 });
    return Response.json({ data: { id: updated.id, version: updated.version } });
  }
  // DELETE /api/native/tables/:id — EMPTY only
  if (rest === "" && req.method === "DELETE") {
    if (countRows(ctx.dataDir, tenantId, tableId) > 0) return json400("Delete is only allowed on an empty table");
    const done = deleteTable(ctx.dataDir, tenantId, tableId, actor);
    if (!done) return Response.json({ error: "Table not found" }, { status: 404 });
    return Response.json({ ok: true });
  }
  // GET /api/native/tables/:id/rows
  if (rest === "/rows" && req.method === "GET") {
    const limitRaw = P("limit");
    let limit: number | undefined;
    if (limitRaw) {
      limit = Number(limitRaw);
      if (!Number.isFinite(limit) || limit < 1 || limit > 1000) return json400("limit must be 1..1000");
    }
    const rows = listRows(ctx.dataDir, tenantId, tableId, limit);
    return Response.json({ data: { rows, total: rows.length } });
  }
  // POST /api/native/tables/:id/rows — GATED insert
  if (rest === "/rows" && req.method === "POST") {
    const b = parseJsonObject(await req.text());
    if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return json400("data object is required");
    try {
      const res = submitTableWrite(ctx.dataDir, tenantId, tableId, "insert", { rowData: b.data as Record<string, unknown> }, actor);
      if (!res.applied) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return Response.json({ data: { status: "applied", rowId: res.rowId, autonomy: res.autonomy, op: res.op } });
    } catch (e) {
      return validationOr500(e);
    }
  }
  // POST /api/native/tables/:id/import — GATED bulk import
  if (rest === "/import" && req.method === "POST") {
    const b = parseJsonObject(await req.text());
    const format = typeof b.format === "string" ? b.format.toLowerCase() : "";
    const content = typeof b.content === "string" ? b.content : "";
    const parsed = parseImportContent(format, content);
    if (!parsed.ok) return json400(parsed.error);
    if (parsed.rows.length > MAX_IMPORT_ROWS) return json400(`Import exceeds ${MAX_IMPORT_ROWS} rows`);
    try {
      const res = submitTableWrite(ctx.dataDir, tenantId, tableId, "import", { rowData: {}, importRows: parsed.rows }, actor);
      if (!res.applied) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId, rows: parsed.rows.length } }, { status: 202 });
      return Response.json({ data: { status: "applied", op: res.op, autonomy: res.autonomy } });
    } catch (e) {
      return validationOr500(e);
    }
  }
  // GET /api/native/tables/:id/export?format=csv|json
  if (rest === "/export" && req.method === "GET") {
    const format = (P("format") || "json").toLowerCase();
    const rows = listRows(ctx.dataDir, tenantId, tableId);
    if (format === "csv") {
      return new Response(toCsv(table, rows), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${tableId}.csv"`,
          "cache-control": "no-store",
        },
      });
    }
    if (format === "json") {
      return Response.json({ data: { table: { id: table.id, name: table.name }, rows } }, { status: 200 });
    }
    return json400("format must be csv or json");
  }
  // ── /api/native/tables/:id/rows/:rowId — GATED update/delete ──
  const rowMatch = pathname.match(/^\/api\/native\/tables\/([A-Za-z0-9_-]+)\/rows\/([A-Za-z0-9_-]+)$/);
  if (rowMatch && rowMatch[1] === tableId) {
    const rowId = rowMatch[2];
    const row = getRow(ctx.dataDir, tenantId, rowId);
    if (!row || row.tableId !== tableId) return Response.json({ error: "Row not found" }, { status: 404 });
    if (req.method === "POST") {
      const b = parseJsonObject(await req.text());
      if (!b.data || typeof b.data !== "object" || Array.isArray(b.data)) return json400("data object is required");
      try {
        const res = submitTableWrite(ctx.dataDir, tenantId, tableId, "update", { rowData: b.data as Record<string, unknown>, existingRowId: rowId }, actor);
        if (!res.applied) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
        return Response.json({ data: { status: "applied", rowId: res.rowId, autonomy: res.autonomy, op: res.op } });
      } catch (e) {
        return validationOr500(e);
      }
    }
    if (req.method === "DELETE") {
      try {
        const res = submitTableWrite(ctx.dataDir, tenantId, tableId, "delete", { rowData: {}, existingRowId: rowId }, actor);
        if (!res.applied) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
        return Response.json({ data: { status: "applied", rowId: res.rowId, autonomy: res.autonomy, op: res.op } });
      } catch (e) {
        return validationOr500(e);
      }
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

const VALIDATION_ERROR_PREFIXES = [
  "name is required", "fields must", "No more", "field key", "duplicate field key",
  "select field", "Row invalid", "row data must", "Field ", "Unknown field key",
  "import ", "format must", "Table at cap", "Import would", "delete requires",
  "update requires", "unsupported op", "tenantId, tableId", "table not found",
  "not found", "cap reached", "exceeds", "is required", "must be", "Invalid JSON",
  "Body must be", "limit must", "Pending-write cap", "Schema update",
];
function validationOr500(e: unknown): Response {
  const msg = e instanceof Error ? e.message : String(e);
  if (VALIDATION_ERROR_PREFIXES.some((p) => msg.startsWith(p))) {
    return Response.json({ error: msg }, { status: 400 });
  }
  console.error(`[native-tables] error: ${msg}`);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

export function handleNativeTablesAuthed(req: Request, ctx: NativeTablesCtx): Promise<Response> {
  return route(req, ctx);
}

