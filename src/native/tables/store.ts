/**
 * native/tables/store.ts — durable, tenant-keyed data-table store (1.4).
 *
 * - Every read/write takes tenantId explicitly and resolves the EXACT tenant
 *   map first — zero cross-tenant paths (a foreign table/row id resolves to
 *   null → fail-closed 404 upstream).
 * - Mutations are applied ONLY by the gated write path (gate.ts) or the
 *   idempotent pending-apply executor — the store never writes rows directly.
 * - DELETE accepts exactly ONE known id; a table delete FAILS CLOSED while it
 *   has rows (no cascade surprises). Row deletes are exact-id only.
 * - Every mutation appends an IMMUTABLE native.data.* audit entry — auditors
 *   see pending + applied writes.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_TABLES_KEY,
  NATIVE_TABLES_AUDIT_KEY,
  type TableDef,
  type DataRow,
  type TableOp,
  type PendingTableWrite,
} from "./types";

export interface NativeTableAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.data.<table|row|pending|apply>.*
  detail: string;
}

interface TenantTableState {
  tables: TableDef[];
  rows: DataRow[];
  pendingWrites: PendingTableWrite[];
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadState(dataDir: string): Record<string, TenantTableState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_TABLES_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantTableState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantTableState>): void {
  writeJSON(dataPath(dataDir, NATIVE_TABLES_KEY), state);
}

export function generateTableEntityId(prefix: "tbl" | "row" | "ptw"): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// ── Tables ──────────────────────────────────────────────────────────────────
export function listTables(dataDir: string, tenantId: string): TableDef[] {
  return loadState(dataDir)[tenantId]?.tables ?? [];
}
export function getTable(dataDir: string, tenantId: string, tableId: string): TableDef | null {
  return listTables(dataDir, tenantId).find((t) => t.id === tableId) ?? null;
}
export function countRows(dataDir: string, tenantId: string, tableId: string): number {
  return listRows(dataDir, tenantId, tableId).length;
}
/** Create a table (schema validated upstream). Audits. */
export function createTable(dataDir: string, table: TableDef): void {
  const state = loadState(dataDir);
  const tenant = state[table.tenantId] ?? { tables: [], rows: [], pendingWrites: [] };
  tenant.tables.push(table);
  state[table.tenantId] = tenant;
  saveState(dataDir, state);
  appendAudit(dataDir, table.tenantId, table.createdBy, "native.data.table.create", `Table ${table.id} (${table.fields.length} fields)`);
}
/** Replace the schema of an EMPTY table only (caller enforces empty). */
export function updateTableSchema(dataDir: string, tenantId: string, tableId: string, fields: TableDef["fields"], name: string, description: string, actor: string): TableDef | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return null;
  const idx = tenant.tables.findIndex((t) => t.id === tableId);
  if (idx < 0) return null;
  if (tenant.rows.some((r) => r.tableId === tableId)) return null; // fail-closed
  const table = tenant.tables[idx];
  table.fields = fields;
  table.name = name;
  table.description = description;
  table.version += 1;
  table.updatedAt = new Date().toISOString();
  table.updatedBy = actor;
  state[tenantId] = tenant;
  saveState(dataDir, state);
  appendAudit(dataDir, tenantId, actor, "native.data.table.update", `Table ${tableId} -> v${table.version}`);
  return table;
}
/** Delete a table ONLY when it has no rows (fail-closed). */
export function deleteTable(dataDir: string, tenantId: string, tableId: string, actor: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return false;
  const idx = tenant.tables.findIndex((t) => t.id === tableId);
  if (idx < 0) return false;
  if (tenant.rows.some((r) => r.tableId === tableId)) return false;
  tenant.tables.splice(idx, 1);
  state[tenantId] = tenant;
  saveState(dataDir, state);
  appendAudit(dataDir, tenantId, actor, "native.data.table.delete", `Table ${tableId}`);
  return true;
}

// ── Rows (mutated ONLY by the gated write path) ─────────────────────────────
export function listRows(dataDir: string, tenantId: string, tableId?: string, limit?: number): DataRow[] {
  const all = loadState(dataDir)[tenantId]?.rows ?? [];
  const scoped = tableId ? all.filter((r) => r.tableId === tableId) : [...all];
  scoped.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  return limit ? scoped.slice(0, limit) : scoped;
}
export function getRow(dataDir: string, tenantId: string, rowId: string): DataRow | null {
  return listRows(dataDir, tenantId).find((r) => r.id === rowId) ?? null;
}
/** Insert a row (validated + gated upstream). Returns the stored row. */
export function insertRow(dataDir: string, row: DataRow): DataRow {
  const state = loadState(dataDir);
  const tenant = state[row.tenantId] ?? { tables: [], rows: [], pendingWrites: [] };
  tenant.rows.push(row);
  state[row.tenantId] = tenant;
  saveState(dataDir, state);
  appendAudit(dataDir, row.tenantId, row.createdBy, "native.data.row.insert", `Row ${row.id} in table ${row.tableId}`);
  return row;
}
/** Replace an existing row's data (exact id; validates 1 row). */
export function updateRow(dataDir: string, tenantId: string, rowId: string, data: Record<string, unknown>, actor: string): DataRow | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return null;
  const idx = tenant.rows.findIndex((r) => r.id === rowId);
  if (idx < 0) return null;
  const row = tenant.rows[idx];
  row.data = data;
  row.updatedAt = new Date().toISOString();
  row.updatedBy = actor;
  state[tenantId] = tenant;
  saveState(dataDir, state);
  appendAudit(dataDir, tenantId, actor, "native.data.row.update", `Row ${rowId} in table ${row.tableId}`);
  return row;
}
/** Delete an exact row id (validated + gated upstream). */
export function deleteRow(dataDir: string, tenantId: string, rowId: string, actor: string): DataRow | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return null;
  const idx = tenant.rows.findIndex((r) => r.id === rowId);
  if (idx < 0) return null;
  const [row] = tenant.rows.splice(idx, 1);
  state[tenantId] = tenant;
  saveState(dataDir, state);
  appendAudit(dataDir, tenantId, actor, "native.data.row.delete", `Row ${rowId} in table ${row.tableId}`);
  return row;
}

// ── Pending writes (the gate's mirror of the Approval Queue card) ───────────
export function listPendingWrites(dataDir: string, tenantId: string, tableId?: string): PendingTableWrite[] {
  const all = loadState(dataDir)[tenantId]?.pendingWrites ?? [];
  const scoped = tableId ? all.filter((w) => w.tableId === tableId) : all;
  return [...scoped].sort((a, b) => (b.requestedAt > a.requestedAt ? 1 : -1));
}
export function getPendingWrite(dataDir: string, tenantId: string, ptwId: string): PendingTableWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === ptwId) ?? null;
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, actionId: string): PendingTableWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === actionId) ?? null;
}
export function savePendingWrite(dataDir: string, write: PendingTableWrite): void {
  const state = loadState(dataDir);
  const tenant = state[write.tenantId] ?? { tables: [], rows: [], pendingWrites: [] };
  tenant.pendingWrites.push(write);
  state[write.tenantId] = tenant;
  saveState(dataDir, state);
  appendAudit(dataDir, write.tenantId, write.requestedBy, "native.data.write.pending", `${write.op} on table ${write.tableId} (approval ${write.approvalActionId})`);
}
export function markPendingWrite(dataDir: string, tenantId: string, ptwId: string, status: "applied" | "rejected", actor: string, detail?: { appliedRowIds?: string[]; error?: string }): PendingTableWrite | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  if (!tenant) return null;
  const idx = tenant.pendingWrites.findIndex((w) => w.id === ptwId);
  if (idx < 0) return null;
  const write = tenant.pendingWrites[idx];
  const was = write.status;
  write.status = status;
  write.appliedAt = new Date().toISOString();
  write.appliedBy = actor;
  if (detail?.appliedRowIds) write.appliedRowIds = detail.appliedRowIds;
  if (detail?.error !== undefined) write.resultError = detail.error;
  state[tenantId] = tenant;
  saveState(dataDir, state);
  appendAudit(dataDir, tenantId, actor, status === "applied" ? "native.data.write.applied" : "native.data.write.rejected", `Pending write ${write.id} ${was} -> ${status}`);
  return write;
}

// ── Audit (immutable, tenant-keyed) ─────────────────────────────────────────
export function appendAudit(dataDir: string, tenantId: string, actor: string, action: string, detail: string): NativeTableAuditEntry {
  const entry: NativeTableAuditEntry = {
    id: `nta-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
    ts: new Date().toISOString(),
    tenantId,
    actor,
    action,
    detail,
  };
  const path = dataPath(dataDir, NATIVE_TABLES_AUDIT_KEY);
  const raw = readJSON(path);
  const all: Record<string, NativeTableAuditEntry[]> = raw && typeof raw === "object" ? (raw as Record<string, NativeTableAuditEntry[]>) : {};
  const entries = all[tenantId] || [];
  entries.push(entry); // append-only
  all[tenantId] = entries;
  writeJSON(path, all);
  return entry;
}
export function listAudit(dataDir: string, tenantId: string): NativeTableAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_TABLES_AUDIT_KEY));
  const all = raw && typeof raw === "object" ? (raw as Record<string, NativeTableAuditEntry[]>) : {};
  return all[tenantId] ?? [];
}
export function countAudit(dataDir: string, tenantId: string): number {
  return listAudit(dataDir, tenantId).length;
}
export function totalRowBytes(dataDir: string, tenantId: string, tableId: string): number {
  return listRows(dataDir, tenantId, tableId).reduce((n, r) => n + JSON.stringify(r.data).length, 0);
}
// VERB-FIRST action names — the Approval Queue classifies writes by leading
// verb prefix (isWriteAction), so verb-last names would silently BYPASS the
// gate and auto-allow every write (fail-open). Never rename these.
export function opVerb(op: TableOp): string {
  switch (op) {
    case "insert": return "createTableRow";
    case "update": return "updateTableRow";
    case "delete": return "deleteTableRow";
    case "import": return "importTableRows";
  }
}