/**
 * native/tables/index.ts — Phase 1.4 native capability: DATA-TABLE CRUD +
 * GATED WRITE PATH. Barrel. Generic record store (tables, typed fields,
 * JSONB rows; CSV/JSON import+export) where every write rides the existing
 * Approval Queue by default and autonomy auto-writes only against explicit
 * allow-listed actions/known-row ids; auditors see every write through the
 * immutable native.data.* trail.
 */
import { handleNativeTablesAuthed, type NativeTablesCtx } from "./router";
import { submitTableWrite, executePendingTableWrite, noteOwnerDecision, type WriteRequest, type WriteResult } from "./gate";
import { validateTableSchema, validateRowData, parseImportContent, toCsv, parseCsv } from "./validate";
import {
  listTables,
  getTable,
  listRows,
  getRow,
  listAudit,
  listPendingWrites,
  countRows,
  generateTableEntityId,
} from "./store";
import { NATIVE_TABLES_KEY, NATIVE_TABLES_AUDIT_KEY, MAX_TABLES_PER_TENANT, MAX_ROWS_PER_TABLE, MAX_PENDING_WRITES, MAX_IMPORT_ROWS, MAX_ROW_JSON_BYTES, VALID_TABLE_TYPES, type TableDef, type TableField, type DataRow, type TableOp, type TableFieldType, type PendingTableWrite } from "./types";
export {
  handleNativeTablesAuthed,
  submitTableWrite,
  executePendingTableWrite,
  noteOwnerDecision,
  validateTableSchema,
  validateRowData,
  parseImportContent,
  toCsv,
  parseCsv,
  listTables,
  getTable,
  listRows,
  getRow,
  listAudit,
  listPendingWrites,
  countRows,
  generateTableEntityId,
  NATIVE_TABLES_KEY,
  NATIVE_TABLES_AUDIT_KEY,
  MAX_TABLES_PER_TENANT,
  MAX_ROWS_PER_TABLE,
  MAX_PENDING_WRITES,
  MAX_IMPORT_ROWS,
  MAX_ROW_JSON_BYTES,
  VALID_TABLE_TYPES,
};
export type { NativeTablesCtx, WriteRequest, WriteResult, TableDef, TableField, DataRow, TableOp, TableFieldType, PendingTableWrite };