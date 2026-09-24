/**
 * native/extract/types.ts — Phase 3.3 native AI DOCUMENT UNDERSTANDING
 * (upload → LLM extraction to structured JSON → approval-gated write to
 * records; confidence + human-review UX). LLM-free slice surface: tests run
 * on MockModelClient; the canonical suite never calls a real LLM.
 *
 * Discipline (mirrors P2.1–P3.2 exactly):
 *   - tenant-keyed store + durable pending-write mirror + immutable
 *     native.extract.* audit,
 *   - validation BEFORE the gate (unknown document / bad id never queues),
 *   - every mutation rides the Approval Queue verb-first: the extraction RUN
 *     is a gated write (`extractDocument`) — it spends LLM budget and creates
 *     a durable draft, so it must be approved (or allow-listed by autonomy);
 *     the run's OUTPUT is a DRAFT (the 5b ExtractionResult, confidence +
 *     quality flags, human-review lane) — the draft is NEVER a record write,
 *   - the approval-gated write to 1.4 RECORDS reuses the tables slice's OWN
 *     gated insert (`createTableRow` — already WRITE_VERB-classified +
 *     tested): the portal pre-fills row data from a draft via the row-data
 *     helper (read-only) and submits through /api/native/tables/:id/rows —
 *     no double-queue, no new write verb, fail-open surface zero,
 *   - WRITE_VERB guard: `extract` is ADDED to WRITE_VERB here (it was
 *     missing — extractDocument would have bypassed the Approval Queue as a
 *     READ, the P2.5/P3.1/P3.2 fail-open class); the classification test
 *     asserts extractDocument is a WRITE,
 *   - caps: ≤100 LLM calls/day per tenant (createCostTracker, fail-closed
 *     canSpend BEFORE the run, durable per-tenant cost record AFTER), ≤8000
 *     tokens/run via the LLM layer config, ≤ MAX_PENDING_EXTRACT_WRITES
 *     pending cards; low-confidence / quality-flagged drafts always land in
 *     the human-review lane and can never be auto-written,
 *   - typed native.extract.* events via the Phase 1.1 registry, registered
 *     at prod-server startup; authed-only surface (401 fail-closed).
 */
export type ExtractOp = "extract"; // extractDocument (gated run → draft)

export interface PendingExtractWrite {
  id: string; // xew_<random>
  tenantId: string;
  documentId: string | null; // doc_ — the vault document to understand
  op: ExtractOp;
  payload: { via?: string };
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { status: string; resultId?: string; category?: string; requiresReview?: boolean };
  appliedAt?: string;
  appliedBy?: string;
  error?: string;
}

// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_PENDING_EXTRACT_WRITES = 20;
export const EXTRACT_LLM_CALLS_PER_DAY = 100;
export const EXTRACT_TIER = "strong" as const;

// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_EXTRACT_PENDING_KEY = "native_extract_pending.json";
export const NATIVE_EXTRACT_AUDIT_KEY = "native_extract_audit.json";