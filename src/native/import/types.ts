/**
 * native/import/types.ts — Phase 5.1 (6.1) native IMPORT / MIGRATION slice
 * (client-optional import lanes: pull → map → stage → commit).
 *
 * Owner 10-20 direction (plan rev 366+): external tool connections are
 * CLIENT-OPTIONAL import/migration lanes — a client connects their OWN tools
 * to transfer their data into native services, then runs everything from our
 * site. There is NO reconnect program on our side and we never operate
 * "through" the client's tools. This slice is the CORE backend for that flow:
 *
 *   - tenant-keyed stores + durable pending-write mirror + immutable
 *     native.import.* audit; server-assigned ids ONLY (imp_/imw_/imr_/ima_),
 *   - every mutating action rides the Approval Queue verb-first
 *     (createImport / updateImport / deleteImport / pullImportData /
 *     mapImportFields / commitImport): create/update/delete were ALREADY in
 *     WRITE_VERB; `pull`, `map`, `commit` are ADDED to WRITE_VERB by this
 *     slice — without them those verb-first names classify as READS and
 *     BYPASS the Approval Queue (the standing fail-open guard class). The
 *     classification test is EXTENDED with the full surface (six gated
 *     writes + never-gated reads: list/get/preview/runs/audit/writes).
 *   - validation + caps BEFORE the gate: forged create-ids, unknown
 *     in-tenant target tables, caps and malformed payloads NEVER queue
 *     (fail-closed),
 *   - COMMIT PRECEDENT-LOCKED (3.5 transform): this slice NEVER writes to
 *     tables directly. commit stages the mapped payload, then submits the
 *     TABLES slice's existing gated `importTableRows` write to the Approval
 *     Queue via the tables gate (submitTableWrite) — ONE approval card, no
 *     double-queue, no cross-store writes. The import pending mirror links
 *     to that card and the apply/reject paths delegate to the tables
 *     executor (executePendingTableWrite),
 *   - HONEST RUN LEDGER ONLY: the ledger records exactly what happened
 *     (pulled/mapped/skipped/committed/failed + notes); when no import
 *     source is wired for a provider in this build, pull reports that
 *     honestly (0 pulled) instead of fabricating a count,
 *   - typed events native.import.* via the Phase 1.1 registry; authed-only
 *     surface (401 fail-closed); NO public share lane.
 */
export const NATIVE_IMPORT_JOBS_KEY = "import_jobs.json";
export const NATIVE_IMPORT_STAGING_KEY = "import_staging.json";
export const NATIVE_IMPORT_PENDING_KEY = "import_pending.json";
export const NATIVE_IMPORT_RUNS_KEY = "import_runs.json";
export const NATIVE_IMPORT_AUDIT_KEY = "import_audit.json";
export const NATIVE_IMPORT_PROVIDER = "native-import";
export const NATIVE_IMPORT_WORKFLOW_ID = "native-import";
/** Import job lifecycle — draft → staged → committed | failed. */
export const IMPORT_JOB_STATUSES = ["draft", "staged", "committed", "failed"] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];
/** Field-mapping coercion kinds — deterministic only (NO LLM in the map). */
export const IMPORT_COERCE_KINDS = ["string", "number", "int", "boolean", "trim"] as const;
export type ImportCoerceKind = (typeof IMPORT_COERCE_KINDS)[number];
/** A single deterministic field mapping: target table field ← source field. */
export interface ImportFieldMapping {
  sourceField: string;
  targetField: string;
  coerce?: ImportCoerceKind;
}
/** Import target — for 6.1 CORE only the 1.4 tables slice (vault file lanes
 *  arrive in follow-up PRs 6.4 with their own gated verbs). */
export interface ImportTarget {
  kind: "table";
  tableId: string;
}
/** Core import job record (tenant's own). */
export interface ImportJob {
  id: string; // imp_
  tenantId: string;
  provider: string; // lane id, e.g. "xero" (verified read adapter id)
  sourceLabel: string;
  target: ImportTarget;
  mapping: ImportFieldMapping[];
  status: ImportJobStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
/** Tenant-keyed staged rows per import (bounded: MAX_STAGING_ROWS / bytes). */
export interface ImportStaging {
  importId: string;
  tenantId: string;
  rows: Record<string, unknown>[];
  byteLength: number;
  pulledAt: string;
  pulledBy: string;
}
/** Durable pending-write mirror — links to the ONE approval card. For
 *  commitImport the card is the TABLES importTableRows card (precedent), for
 *  pull/map/create/update/delete it is the import slice's own card. */
export interface PendingImportWrite {
  id: string; // imw_
  tenantId: string;
  importId: string;
  op: ImportOp;
  action: string;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  payload: Record<string, unknown>;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { committed?: number; rowIds?: string[]; note?: string } | null;
  error?: string;
}
/** Honest run ledger — exactly what happened, never a fabricated count. */
export interface ImportRun {
  id: string; // imr_
  tenantId: string;
  importId: string;
  op: ImportOp | "reject";
  at: string;
  by: string;
  pulled: number;
  mapped: number;
  skipped: number;
  committed: number;
  failed: number;
  note: string;
  /** Provider HTTP status observed during a pull (honest ledger; absent when
   *  no provider call happened or op is not a pull). */
  httpStatus?: number;
}
/** Immutable native.import.* audit line. */
export interface NativeImportAuditEntry {
  id: string; // ima_
  ts: string;
  tenantId: string;
  actor: string;
  action: string;
  entityId: string;
  detail: string;
}
/** The full gated import surface (verb-first). */
export type ImportOp =
  | "createImport"
  | "updateImport"
  | "deleteImport"
  | "pullImportData"
  | "mapImportFields"
  | "commitImport";
// ── Caps (fail-closed; enforced in gate.ts BEFORE the gate) ────────────────
export const MAX_IMPORT_RUNS_PER_TENANT = 50; // import jobs per tenant
export const MAX_STAGING_ROWS = 200; // staged rows per import (aligns tables MAX_IMPORT_ROWS)
export const MAX_IMPORT_BYTES = 512 * 1024; // 512 KiB staging payload
export const MAX_MAPPING_FIELDS = 30; // aligns tables MAX_FIELDS_PER_TABLE
export const MAX_PENDING_IMPORT_WRITES = 50;
export const MAX_PULL_ATTEMPTS_PER_DAY = 20;
export const MAX_PAGE_SIZE = 100; // pagination cap
export const MAX_SOURCE_LABEL = 120;
export const MAX_SOURCE_FIELD_CHARS = 120;
export const MAX_TARGET_FIELD_CHARS = 120;
export const MAX_PROVIDER_ID = 40;
export const MAX_PREVIEW_ROWS = 10; // read-only preview projection bound