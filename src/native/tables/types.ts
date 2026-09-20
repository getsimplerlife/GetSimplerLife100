/**
 * native/tables/types.ts — Phase 1.4 native capability: DATA-TABLE CRUD +
 * GATED WRITE PATH. A generic record store (tables, typed fields, JSONB
 * rows; CSV/JSON import+export) where every write rides the existing
 * Approval Queue (#164) by default and autonomy auto-writes ONLY against
 * explicit allow-listed actions/ids (#236). Auditors see every write
 * (pending + applied) through an immutable native.data.* trail.
 *
 * Isolation: all tenant maps are `{ [tenantId]: ... }` — a table/row id
 * resolves ONLY under its owning tenant (foreign id → fail-closed 404).
 * Row data is validated against the table schema BEFORE it ever reaches the
 * gate (invalid writes are rejected outright, never queued).
 */

export type TableFieldType = "text" | "textarea" | "number" | "boolean" | "date" | "select" | "email" | "json";

export interface TableField {
  key: string; // strict slug [A-Za-z0-9_-]{1,40}
  label: string;
  type: TableFieldType;
  required?: boolean;
  options?: string[]; // select only
}

export interface TableDef {
  id: string; // tbl_<random>
  tenantId: string;
  name: string;
  description: string;
  fields: TableField[];
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface DataRow {
  id: string; // row_<random>
  tenantId: string;
  tableId: string;
  /** JSONB row data — validated against the table schema. */
  data: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type TableOp = "insert" | "update" | "delete" | "import";

export interface PendingTableWrite {
  id: string; // ptw_<random>
  tenantId: string;
  tableId: string;
  op: TableOp;
  /** Validated payload snapshot captured at request time. */
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string; // links to the Approval Queue card
  requestedBy: string;
  requestedAt: string;
  appliedAt?: string;
  appliedBy?: string;
  resultError?: string;
  /** row ids produced/applied (for idempotent imports). */
  appliedRowIds?: string[];
}

export const NATIVE_TABLES_KEY = "native_tables.json";
export const NATIVE_TABLES_AUDIT_KEY = "native_tables_audit.json";
export const MAX_TABLES_PER_TENANT = 20;
export const MAX_FIELDS_PER_TABLE = 30;
export const MAX_FIELD_KEY = 40;
export const MAX_FIELD_LABEL = 80;
export const MAX_TABLE_NAME = 120;
export const MAX_TABLE_DESCRIPTION = 500;
export const MAX_OPTIONS = 50;
export const MAX_OPTION_LEN = 200;
export const MAX_ROWS_PER_TABLE = 2000;
export const MAX_ROW_JSON_BYTES = 64 * 1024; // 64 KiB row cap (JSONB bound)
export const MAX_PENDING_WRITES = 200;
export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_BYTES = 512 * 1024; // 512 KiB import payload
export const VALID_TABLE_TYPES: readonly TableFieldType[] = ["text", "textarea", "number", "boolean", "date", "select", "email", "json"];