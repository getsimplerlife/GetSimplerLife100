/**
 * native/fileimport/index.ts — public surface of the universal file import
 * (slice 137): CSV/JSON upload → column mapping → per-row validation → write
 * into a REAL existing store (native tables rows, native knowledge-base
 * articles). No third-party credentials are involved anywhere in this lane.
 */
export { handleNativeFileImportAuthed, publicJob } from "./router";
export type { NativeFileImportCtx } from "./router";
export {
  applyPendingFileImport,
  rejectFileImportWrite,
  submitFileImportWrite,
  executeCommit,
  validateJob,
  existingTargetKeys,
  FILE_IMPORT_ACTION,
} from "./gate";
export type { FileImportWriteResult } from "./gate";
export {
  deriveColumns,
  kbTitleKey,
  normalizeFormat,
  parseFileContent,
  stableKey,
  targetFieldKeys,
  validateFileImportRows,
  validateMapping,
} from "./parse";
export {
  appendAudit,
  deleteJobRecord,
  deleteRowsForJob,
  generateFileImportEntityId,
  getJob,
  getPendingWriteByAction,
  getPendingWriteById,
  getPendingWriteForJob,
  getRows,
  listAudit,
  listJobs,
  listPendingWrites,
  markPendingWrite,
  saveJob,
  savePendingWrite,
  saveRows,
} from "./store";
export {
  DEDUPE_POLICY,
  DEDUPE_POLICY_TEXT,
  FILE_IMPORT_FORMATS,
  FILE_IMPORT_STATUSES,
  FILE_IMPORT_TARGET_KINDS,
  GATED_FILE_IMPORT_OPS,
  KB_ARTICLE_TARGET_FIELDS,
  MAX_FILE_IMPORT_BYTES,
  MAX_FILE_IMPORT_JOBS,
  MAX_FILE_IMPORT_MAPPING,
  MAX_FILE_IMPORT_NAME,
  MAX_FILE_IMPORT_PENDING,
  MAX_FILE_IMPORT_PREVIEW_ROWS,
  MAX_FILE_IMPORT_ROWS,
  NATIVE_FILE_IMPORT_AUDIT_KEY,
  NATIVE_FILE_IMPORT_JOBS_KEY,
  NATIVE_FILE_IMPORT_PENDING_KEY,
  NATIVE_FILE_IMPORT_PROVIDER,
  NATIVE_FILE_IMPORT_ROWS_KEY,
  NATIVE_FILE_IMPORT_WORKFLOW_ID,
} from "./types";
export type {
  FileImportFormat,
  FileImportJob,
  FileImportMapping,
  FileImportOp,
  FileImportRow,
  FileImportRowError,
  FileImportStatus,
  FileImportTarget,
  FileImportTargetKind,
  FileImportValidation,
  NativeFileImportAuditEntry,
  PendingFileImportWrite,
} from "./types";
