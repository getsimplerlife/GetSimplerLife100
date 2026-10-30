/**
 * native/fileimport/types.ts — slice 137: UNIVERSAL FILE IMPORT (the
 * credential-free path to getting a customer's real data into our site).
 *
 * WHY THIS EXISTS: of the 179 catalogued apps, every API lane needs an OAuth
 * app registration owned by an account holder (the tenant or us). A FILE does
 * not. CSV/JSON upload → column mapping → per-row validation → write into a
 * real store needs NOTHING from a third party, so it is the foundation of the
 * whole import program.
 *
 * SCOPE OF THIS SLICE (deliberately narrow):
 *   - one import job = one file, one target dataset, one mapping;
 *   - CSV + JSON parsed by the TABLES slice's existing parser (no second
 *     parser); XLSX is REJECTED with a clear message because no XLSX parser is
 *     a dependency of this build (say it plainly, never half-parse a binary);
 *   - two REAL target stores, written through their own store writers:
 *       * `table`      → native/tables  (insertRow) — CRM-style records
 *       * `kb-article` → native/knowledgebase (saveArticle) — help articles
 *     No parallel store is created for imported data.
 *
 * GUARDRAILS (non-negotiable, tested):
 *   - structural tenant scoping `{ [tenantId]: ... }`; a stranger's job id
 *     resolves to null → 404 (no IDOR),
 *   - fail-closed auth upstream (401) — this module never sees an anonymous
 *     request,
 *   - append-only audit on EVERY mutation (native.fileimport.*),
 *   - size + row caps enforced BEFORE anything is stored (clear 400 error),
 *   - de-dupe policy = SKIP (see DEDUPE_POLICY below): an import can only ADD.
 *     It never updates, never overwrites and never deletes a row it did not
 *     create — a "failed row does not partially write" and a re-run of the
 *     same file writes nothing the second time,
 *   - COMMIT IS ALL-OR-NOTHING: if any row fails validation the whole commit
 *     is refused with the full per-row error list and ZERO rows are written.
 *
 * APPROVAL MODEL (one deliberate difference from the provider-import slice):
 * create / upload / map mutate ONLY the tenant's own draft job record — they
 * touch no store and hold no customer data in any capability — so they are
 * audited but not queued. The ONE action that writes into a real store,
 * `commitFileImport`, rides the Approval Queue (verb-first) exactly like every
 * other native write, and is executed by this slice's own apply/reject paths.
 */

export const NATIVE_FILE_IMPORT_JOBS_KEY = "file_import_jobs.json";
export const NATIVE_FILE_IMPORT_ROWS_KEY = "file_import_rows.json";
export const NATIVE_FILE_IMPORT_AUDIT_KEY = "file_import_audit.json";
export const NATIVE_FILE_IMPORT_PENDING_KEY = "file_import_pending.json";

export const NATIVE_FILE_IMPORT_PROVIDER = "native-file-import";
export const NATIVE_FILE_IMPORT_WORKFLOW_ID = "native-file-import";

/** Job lifecycle: draft → uploaded → mapped → committed | failed. */
export const FILE_IMPORT_STATUSES = ["draft", "uploaded", "mapped", "committed", "failed"] as const;
export type FileImportStatus = (typeof FILE_IMPORT_STATUSES)[number];

/** Formats we actually parse. XLSX is intentionally absent — see parse.ts. */
export const FILE_IMPORT_FORMATS = ["csv", "json"] as const;
export type FileImportFormat = (typeof FILE_IMPORT_FORMATS)[number];

/** Target datasets backed by REAL existing stores (never a parallel store). */
export const FILE_IMPORT_TARGET_KINDS = ["table", "kb-article"] as const;
export type FileImportTargetKind = (typeof FILE_IMPORT_TARGET_KINDS)[number];

/**
 * DE-DUPE POLICY — stated on screen and enforced server-side: SKIP.
 * A row whose mapped record already exists in the target (or earlier in the
 * same file) is SKIPPED and counted. Existing rows are never updated,
 * overwritten or deleted by an import.
 */
export const DEDUPE_POLICY = "skip" as const;
export const DEDUPE_POLICY_TEXT =
  "Duplicates are skipped, never updated — an import can only add records. It never overwrites or deletes a record it did not create.";

/** Target reference. `table` needs a server-assigned in-tenant table id. */
export interface FileImportTarget {
  kind: FileImportTargetKind;
  tableId?: string;
}

/** One mapping entry: file column → target field. */
export interface FileImportMapping {
  sourceField: string;
  targetField: string;
}

/** A staged source row. `rowNumber` is 1-based over DATA rows: row 1 is the
 *  first row after the CSV header (for JSON, the first array element). */
export interface FileImportRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

export interface FileImportJob {
  id: string; // fimp_<random> — server-assigned
  tenantId: string;
  name: string;
  target: FileImportTarget;
  format: FileImportFormat | null;
  status: FileImportStatus;
  /** Source columns discovered at upload (union of keys, first-seen order). */
  columns: string[];
  mapping: FileImportMapping[];
  rowCount: number;
  byteLength: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  committedAt?: string;
  committedBy?: string;
  committedCount?: number;
  skippedCount?: number;
  error?: string;
}

/** Per-row validation failure — row number + every reason for that row. */
export interface FileImportRowError {
  rowNumber: number;
  reasons: string[];
}

/** Full-file validation result. `errors` is the per-row list (never just the
 *  first bad row); `valid` holds the mapped records ready to write. */
export interface FileImportValidation {
  total: number;
  valid: number;
  skipped: number;
  invalid: number;
  errors: FileImportRowError[];
  /** Mapped+coerced records for the valid rows, in file order. */
  records: Record<string, unknown>[];
  /** Row numbers skipped as duplicates (already in target or earlier in file). */
  skippedRowNumbers: number[];
}

/** Immutable native.fileimport.* audit line. */
export interface NativeFileImportAuditEntry {
  id: string; // fia_<random>
  ts: string;
  tenantId: string;
  actor: string;
  action: string;
  entityId: string;
  detail: string;
}

/** Durable pending-write mirror for the ONE gated action (commit). */
export interface PendingFileImportWrite {
  id: string; // fiw_<random>
  tenantId: string;
  jobId: string;
  action: string;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  /** Row count captured at request time (honest, shown on the card). */
  rowCount: number;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { committed: number; skipped: number } | null;
  error?: string;
}

/** Actions this slice can perform. Only `commitFileImport` is gated. */
export type FileImportOp = "createFileImport" | "uploadFileImport" | "mapFileImportFields" | "commitFileImport";

/** The one action that writes into a real store → rides the Approval Queue. */
export const GATED_FILE_IMPORT_OPS: readonly FileImportOp[] = ["commitFileImport"];

// ── Caps (fail-closed; enforced BEFORE anything is stored) ─────────────────
export const MAX_FILE_IMPORT_JOBS = 25; // draft/committed jobs per tenant
export const MAX_FILE_IMPORT_ROWS = 200; // data rows per file (aligns tables MAX_IMPORT_ROWS)
export const MAX_FILE_IMPORT_BYTES = 512 * 1024; // 512 KiB raw upload
export const MAX_FILE_IMPORT_MAPPING = 30; // mapped fields per job
export const MAX_FILE_IMPORT_NAME = 120; // job name
export const MAX_FILE_IMPORT_PENDING = 25; // pending commit cards per tenant
export const MAX_FILE_IMPORT_PREVIEW_ROWS = 25; // rows returned by get/preview
export const MAX_SOURCE_FIELD_CHARS = 120;
export const MAX_TARGET_FIELD_CHARS = 120;
export const MAX_PAGE_SIZE = 100;

/** Knowledge-base article target fields (the second real store). */
export const KB_ARTICLE_TARGET_FIELDS = ["title", "body", "tags"] as const;
export type KbArticleTargetField = (typeof KB_ARTICLE_TARGET_FIELDS)[number];
