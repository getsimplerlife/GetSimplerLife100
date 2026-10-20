/**
 * native/dedupe/types.ts — Phase 4.2 native DEDUPE / MASTER-DATA slice
 * (golden-record identity, deterministic match rules, merge suggestions and
 * data-quality rules over the tenant's OWN Phase 1.4 record tables).
 *
 * Discipline mirrors 1.4/3.4–3.8/4.1 exactly:
 *   - tenant-keyed stores + durable pending-write mirror + immutable
 *     native.dedupe.* audit; server-assigned ids ONLY
 *     (mru_/qru_/sug_/drn_/gem_/dpw_/dev_),
 *   - every user-initiated WRITE rides the Approval Queue verb-first
 *     (createMatchRule / updateMatchRule / deleteMatchRule /
 *     createQualityRule / updateQualityRule / deleteQualityRule /
 *     runDedupeScan / mergeRecords / deleteSuggestion — `merge` is a NEW
 *     WRITE_VERB added by this slice; the classification test locks the
 *     fail-open guard),
 *   - validation BEFORE the gate: forged create-ids, unknown in-tenant
 *     table/field references, caps, malformed rule payloads and llmAssist
 *     attempts NEVER queue (fail-closed),
 *   - NON-DESTRUCTIVE MERGE: a merge records a durable record-IDENTITY
 *     pointer (survivor row + superseded row ids + before/after audit
 *     snapshots). The underlying 1.4 rows are NEVER deleted or rewritten by
 *     this slice — reads keep using the survivor as canonical,
 *   - HONEST OUTCOMES ONLY: the scan run ledger records rows scanned,
 *     suggestions produced and quality issues found, and states plainly that
 *     no record was deleted or modified by the scan; merge outcomes record
 *     the identity pointer, never a claim that rows were consolidated in the
 *     source table,
 *   - matching is DETERMINISTIC (normalized/exact field comparison).
 *     LLM-assisted matching is NOT enabled in this slice (llmAssist is
 *     locked to false; the honest disabled note rides every rule + run),
 *   - typed events native.dedupe.* via the Phase 1.1 registry; authed-only
 *     surface (401 fail-closed); NO public share lane.
 */
export const NATIVE_DEDUPE_MATCH_RULES_KEY = "dedupe_match_rules.json";
export const NATIVE_DEDUPE_QUALITY_RULES_KEY = "dedupe_quality_rules.json";
export const NATIVE_DEDUPE_RUNS_KEY = "dedupe_runs.json";
export const NATIVE_DEDUPE_SUGGESTIONS_KEY = "dedupe_suggestions.json";
export const NATIVE_DEDUPE_IDENTITIES_KEY = "dedupe_identities.json";
export const NATIVE_DEDUPE_PENDING_KEY = "dedupe_pending.json";
export const NATIVE_DEDUPE_AUDIT_KEY = "dedupe_audit.json";
export const NATIVE_DEDUPE_PROVIDER = "native-dedupe";
export const NATIVE_DEDUPE_WORKFLOW_ID = "native-dedupe";

// ── Caps (fail-closed; enforced in gate.ts BEFORE the gate) ────────────────
export const MAX_MATCH_RULES_PER_TENANT = 20;
export const MAX_QUALITY_RULES_PER_TENANT = 20;
export const MAX_MATCH_FIELDS_PER_RULE = 10;
export const MAX_DEDUPE_RUNS_PER_TENANT = 200;
export const MAX_OPEN_SUGGESTIONS = 500;
export const MAX_SUGGESTIONS_PER_SCAN = 100;
export const MAX_QUALITY_ISSUES_PER_RUN = 1000;
export const MAX_RECORD_IDENTITIES_PER_TENANT = 500;
export const MAX_MERGE_SUPERSEDED_ROWS = 20;
export const MAX_PENDING_DEDUPE_WRITES = 50;
export const MAX_DAILY_SCANS = 20;
export const MAX_RULE_NAME = 120;
export const MAX_RULE_DESCRIPTION = 300;
export const MAX_FIELD_KEY = 40; // mirrors 1.4 field keys
export const MAX_PAIR_COMPARISONS = 250_000; // deterministic scan budget
export const MAX_NORMALIZED_FIELD_CHARS = 200;
export const MAX_QUALITY_PARAM_CHARS = 64;
export const MAX_AUDIT_SNAPSHOT_CHARS = 8000;

export const MATCH_MODES = ["exact", "normalized"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];
export const QUALITY_RULE_TYPES = ["required", "email", "phone", "number-range", "date-format"] as const;
export type QualityRuleType = (typeof QUALITY_RULE_TYPES)[number];

/** Dedupe match rule: which table, which fields, how to compare. */
export interface MatchRule {
  id: string; // mru_<random> — server-assigned
  tenantId: string;
  name: string;
  description: string;
  tableId: string; // must resolve in-tenant via 1.4 tables
  fields: string[]; // 1..MAX_MATCH_FIELDS_PER_RULE field keys from the table schema
  matchMode: MatchMode; // exact | normalized (trim + casefold + whitespace collapse)
  /** LLM-assisted matching is NOT enabled in this slice — locked to false. */
  llmAssist: false;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Deterministic data-quality rule evaluated by a scan over 1.4 rows. */
export interface QualityRule {
  id: string; // qru_<random> — server-assigned
  tenantId: string;
  name: string;
  description: string;
  tableId: string; // in-tenant table
  field: string; // in-tenant field key
  ruleType: QualityRuleType;
  /** ruleType-specific bounds (number-range min/max). */
  params: { min?: number; max?: number };
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/** Merge suggestion produced by a deterministic scan (candidates only). */
export interface MergeSuggestion {
  id: string; // sug_<random> — server-assigned
  tenantId: string;
  tableId: string;
  ruleId: string;
  runId: string;
  rowIds: string[]; // exactly 2 rows (survivor candidate + duplicate candidate)
  matchedFields: { field: string; value: string }[];
  /** Deterministic exact/normalized match — 1.0; never a fuzzy number. */
  confidence: 1;
  status: "open" | "applied" | "dismissed";
  createdAt: string;
  createdBy: string;
  appliedAt?: string;
  appliedBy?: string;
}

/** Durable scan-run ledger entry — HONEST outcomes only. */
export interface DedupeRun {
  id: string; // drn_<random> — server-assigned
  tenantId: string;
  matchRuleIds: string[];
  qualityRuleIds: string[];
  rowsScanned: number;
  pairComparisons: number;
  suggestionsProduced: number;
  qualityIssuesFound: number;
  /** True when the pairwise budget (MAX_PAIR_COMPARISONS) was reached —
   *  remaining rows were not compared in this run. */
  bounded: boolean;
  status: "pending" | "applied" | "rejected";
  outcome: "recorded" | "rejected";
  /** Honest note: scan only produces candidates; nothing was merged. */
  note: string;
  approvalActionId?: string;
  createdAt: string;
  createdBy: string;
  decidedAt?: string;
  decidedBy?: string;
}

/** Golden-record identity — the NON-DESTRUCTIVE merge result. The underlying
 *  1.4 rows are NEVER deleted or modified; this pointer makes the survivor
 *  row canonical for reads and marks superseded rows as resolved. */
export interface RecordIdentity {
  id: string; // gem_<random> — server-assigned
  tenantId: string;
  tableId: string;
  survivorRowId: string; // canonical row (more non-empty fields; tie → earliest)
  supersededRowIds: string[]; // resolved duplicates pointed at the survivor
  suggestionId?: string;
  mergedAt: string;
  mergedBy: string;
  /** Honest note: rows were not deleted or modified. */
  note: string;
}

export interface PendingDedupeWrite {
  id: string; // dpw_<random> — server-assigned
  tenantId: string;
  op: DedupeOp;
  action: string; // approval action name (verb-first)
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: Record<string, unknown>;
  error?: string;
}

export interface NativeDedupeAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.dedupe.*
  entityId?: string;
  detail: string;
}

export type DedupeOp =
  | "createMatchRule"
  | "updateMatchRule"
  | "deleteMatchRule"
  | "createQualityRule"
  | "updateQualityRule"
  | "deleteQualityRule"
  | "runDedupeScan"
  | "mergeRecords"
  | "deleteSuggestion";