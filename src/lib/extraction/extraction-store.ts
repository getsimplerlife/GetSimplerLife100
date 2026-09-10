/**
 * extraction-store.ts — Phase 1.5b durable per-tenant extraction records.
 *
 * Each run persists an ExtractionResult under a tenant-scoped key (sha256 of
 * the tenant email — the SAME bucket convention as the vault blobs, so zero
 * cross-tenant paths is enforced by construction). Records are version-bound:
 * re-extracting a doc at a new version creates a NEW result; the previous one
 * is never overwritten (non-destructive, auditable history).
 *
 * Lifecycle: pending_review → applied (via the Approval Queue gate — the
 * record stores the PendingAction id) | rejected.
 */
import { readJSON, writeJSON, resolveDataDir } from "../data-store";
import { tenantVaultKey } from "../vault-store";
import type { ExtractionResult, ExtractionSummary } from "./extraction-types";
import { join } from "path";
import { randomBytes } from "crypto";

export const EXTRACTIONS_KEY = "vault_extractions.json";
export const EXTRACTION_RECORD_KEY = "extraction_records";

export function newExtractionId(): string {
  return `ext_${randomBytes(9).toString("hex")}`;
}

function recordsPath(dataDir: string): string {
  return join(resolveDataDir(dataDir, process.cwd()), EXTRACTIONS_KEY);
}

type ExtractionRecords = Record<string, ExtractionResult[]>;

function loadRecords(dataDir: string): ExtractionRecords {
  const raw = readJSON(recordsPath(dataDir)) as Record<string, unknown> | null;
  const out: ExtractionRecords = {};
  for (const [tenant, recs] of Object.entries(raw || {})) {
    if (Array.isArray(recs)) out[tenant] = recs as ExtractionResult[];
  }
  return out;
}

/** Persist one extraction result (append per tenant — never overwrite). */
export function saveExtraction(dataDir: string, tenantEmail: string, result: ExtractionResult): ExtractionResult {
  const records = loadRecords(dataDir);
  const key = tenantVaultKey(tenantEmail);
  const list = records[key] || [];
  list.push(result);
  records[key] = list;
  writeJSON(recordsPath(dataDir), records);
  return result;
}

/** Fetch one result scoped to a tenant (returns null for other tenants' ids). */
export function getExtraction(dataDir: string, tenantEmail: string, resultId: string): ExtractionResult | null {
  const key = tenantVaultKey(tenantEmail);
  const list = loadRecords(dataDir)[key] || [];
  return list.find((r) => r.id === resultId) || null;
}

/** All results for a tenant, newest first. Optionally filter by doc. */
export function listExtractions(
  dataDir: string,
  tenantEmail: string,
  opts?: { docId?: string; status?: ExtractionResult["status"] },
): ExtractionResult[] {
  const key = tenantVaultKey(tenantEmail);
  const list = loadRecords(dataDir)[key] || [];
  const filtered = list.filter(
    (r) =>
      (!opts?.docId || r.docId === opts.docId) &&
      (!opts?.status || r.status === opts.status),
  );
  return [...filtered].reverse(); // newest first
}

/** Latest result for a doc at a given version (or current best). */
export function latestExtraction(dataDir: string, tenantEmail: string, docId: string): ExtractionResult | null {
  const key = tenantVaultKey(tenantEmail);
  const list = loadRecords(dataDir)[key] || [];
  const forDoc = list.filter((r) => r.docId === docId);
  if (!forDoc.length) return null;
  return forDoc[forDoc.length - 1];
}

/** Update status (+ appliedActionId/appliedAt) — the only mutation surface. */
export function updateExtractionStatus(
  dataDir: string,
  tenantEmail: string,
  resultId: string,
  status: ExtractionResult["status"],
  appliedActionId?: string,
): ExtractionResult | null {
  const key = tenantVaultKey(tenantEmail);
  const records = loadRecords(dataDir);
  const list = records[key] || [];
  const idx = list.findIndex((r) => r.id === resultId);
  if (idx === -1) return null;
  const next: ExtractionResult = { ...list[idx], status };
  if (status === "applied") {
    next.appliedActionId = appliedActionId;
    next.appliedAt = new Date().toISOString();
  }
  list[idx] = next;
  records[key] = list;
  writeJSON(recordsPath(dataDir), records);
  return next;
}

/** Human-review-lane projection (keeps the portal payload light). */
export function summarize(records: ExtractionResult[]): ExtractionSummary[] {
  return records.map((r) => ({
    id: r.id,
    docId: r.docId,
    fileName: r.fileName,
    ext: r.ext,
    category: r.category,
    categoryConfidence: r.categoryConfidence,
    qualityFlags: r.quality.flags.map((f) => f.code),
    requiresReview: r.quality.requiresReview,
    status: r.status,
    createdAt: r.createdAt,
    appliedAt: r.appliedAt,
  }));
}