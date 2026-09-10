/**
 * extraction-gate.ts — Phase 1.5b: applying extraction results is a GATED write.
 *
 * SAFETY FLOOR (owner mandate — holds in EVERY mode):
 *   - extraction output NEVER writes directly. applyExtractedMetadata rides the
 *     SAME approvalGate (#164, provider "vault") as every other vault write,
 *     with the SAME write-verb-first action ("updateVaultDocument");
 *   - autonomy mode (#236) may auto-apply ONLY with an explicit non-glob
 *     allow-list entry AND a known document id — AND the result must NOT
 *     require review (a blurry/unreadable/oversize result can never be
 *     auto-applied; the human lane is the only path);
 *   - every apply/reject appends an immutable vault audit entry;
 *   - the extraction record's status flips applied/rejected with the
 *     PendingAction id retained (non-destructive history).
 *
 * NOTE: application writes METADATA (docType/tags/text) only. Filing the
 * document to the suggested route is a separate explicit user/agent call via
 * the existing fileDocument contract (also gated).
 */
import { approvalGate } from "../approval-queue";
import { recordAutonomyOutcome } from "../autonomy";
import { appendVaultAudit } from "../vault-audit";
import { getVaultDocument, updateVaultDocumentMeta } from "../vault-store";
import { VAULT_PROVIDER_ID, VAULT_ACTIONS } from "../vault-filing";
import { getExtraction, updateExtractionStatus } from "./extraction-store";
import type { ExtractionApplyDecision } from "./extraction-types";

export interface ApplyExtractionOpts {
  tenantEmail: string;
  documentId: string;
  resultId: string;
  actor: string;
  dataDir: string;
  agentId?: string;
  workflowId?: string;
}

export interface ApplyExtractionOutcome {
  ok: boolean;
  pending?: boolean;
  actionId?: string;
  autonomy?: boolean;
  error?: string;
  /** true when the extraction record was already applied (idempotent no-op). */
  unchanged?: boolean;
  /** documentId when metadata was (or will be) applied. */
  documentId?: string;
}

const currentChecksum = (doc: any): string => {
  const latest = doc.versions[doc.versions.length - 1];
  return latest ? latest.sha256 : "";
};

/** Gated apply: extraction → metadata on the vault doc, through the queue. */
export function applyExtractedMetadata(opts: ApplyExtractionOpts): ApplyExtractionOutcome {
  const { tenantEmail, documentId, resultId, actor, dataDir, agentId, workflowId } = opts;
  const doc = getVaultDocument(dataDir, tenantEmail, documentId);
  if (!doc) return { ok: false, error: "Document not found" }; // fail-closed

  const extraction = getExtraction(dataDir, tenantEmail, resultId);
  if (!extraction) return { ok: false, error: "Extraction result not found for this tenant" };
  if (extraction.docId !== documentId) return { ok: false, error: "Extraction result does not belong to this document" };

  // Idempotent no-op: already applied.
  if (extraction.status === "applied") return { ok: true, unchanged: true, documentId };

  // Quality gate: a result that requires review is never auto-appliable.
  // In default mode the human approves the PendingAction (that IS the
  // review); in autonomy mode the gate below must reject it (we enforce by
  // not offering autonomy eligibility to review-required results).
  const params: Record<string, any> = {
    documentId,
    resultId,
    docType: extraction.category,
    tags: extraction.suggestedTags,
    requiresReview: extraction.quality.requiresReview,
  };

  const gate = approvalGate(tenantEmail, VAULT_ACTIONS.update, VAULT_PROVIDER_ID, params, {
    agentId,
    workflowId,
    dataDir,
  });

  if (extraction.quality.requiresReview && gate.autonomy) {
    appendVaultAudit(dataDir, tenantEmail, {
      actor: agentId ? `agent:${agentId}` : actor,
      action: "updateVaultDocument",
      documentId,
      route: doc.route,
      sha256: currentChecksum(doc),
      outcome: "denied",
      detail: "Autonomy auto-apply blocked: extraction requires human review",
    });
    return { ok: false, error: "Extraction requires human review — cannot auto-apply" };
  }

  if (!gate.allowed) {
    appendVaultAudit(dataDir, tenantEmail, {
      actor: agentId ? `agent:${agentId}` : actor,
      action: "updateVaultDocument",
      documentId,
      route: doc.route,
      sha256: currentChecksum(doc),
      outcome: gate.error ? "denied" : "pending",
      detail: gate.error ? gate.error : `Pending approval (${gate.actionId || "?"}) — apply extraction ${resultId}`,
    });
    return { ok: false, pending: true, actionId: gate.actionId, documentId, error: gate.error };
  }

  // Gate passed → execute metadata write.
  const updated = updateVaultDocumentMeta(dataDir, tenantEmail, documentId, {
    docType: extraction.category,
    tags: extraction.suggestedTags,
    customer: extraction.fields.find((f) => f.key === "vendor" || f.key === "merchant" || f.key === "partyA")?.value || undefined,
    text: extraction.textSnippet && extraction.textSnippet.length > 0 ? extraction.textSnippet : undefined,
  });
  if (!updated) {
    if (gate.workflowId) {
      try {
        recordAutonomyOutcome(tenantEmail, gate.workflowId, VAULT_ACTIONS.update, VAULT_PROVIDER_ID, false, {
          dataDir,
          allowListId: gate.allowListId,
          error: "Document vanished after gate",
          target: documentId,
        });
      } catch { /* best-effort */ }
    }
    return { ok: false, error: "Document not found" };
  }

  appendVaultAudit(dataDir, tenantEmail, {
    actor: gate.autonomy ? "system/autonomy" : actor,
    action: "updateVaultDocument",
    documentId,
    route: updated.route,
    sha256: currentChecksum(updated),
    version: updated.version,
    outcome: "ok",
    detail: `Applied extraction ${resultId}: type=${extraction.category} tags=${extraction.suggestedTags.join(",") || "-"}${gate.autonomy ? ` (allow-list ${gate.allowListId})` : ""}`,
  });
  if (gate.autonomy && gate.workflowId) {
    try {
      recordAutonomyOutcome(tenantEmail, gate.workflowId, VAULT_ACTIONS.update, VAULT_PROVIDER_ID, true, {
        dataDir,
        allowListId: gate.allowListId,
        target: documentId,
      });
    } catch { /* best-effort */ }
  }
  updateExtractionStatus(dataDir, tenantEmail, resultId, "applied", gate.actionId || "direct");
  return { ok: true, autonomy: gate.autonomy, documentId };
}

/** Human-review lane: reject a result (decide/apply decision = reject).
 *  Rejection mutates ONLY the extraction record (never a vault doc) — audited
 *  for transparency, not approval-gated (no document write occurs). */
export function rejectExtraction(opts: ApplyExtractionOpts): ApplyExtractionOutcome {
  const { tenantEmail, documentId, resultId, actor, dataDir } = opts;
  const extraction = getExtraction(dataDir, tenantEmail, resultId);
  if (!extraction) return { ok: false, error: "Extraction result not found for this tenant" };
  if (extraction.docId !== documentId) return { ok: false, error: "Extraction result does not belong to this document" };
  if (extraction.status === "applied") return { ok: false, error: "Already applied — cannot reject" };
  if (extraction.status === "rejected") return { ok: true, unchanged: true, documentId };
  updateExtractionStatus(dataDir, tenantEmail, resultId, "rejected");
  const doc = getVaultDocument(dataDir, tenantEmail, documentId);
  appendVaultAudit(dataDir, tenantEmail, {
    actor,
    action: "vault.extraction",
    documentId,
    route: doc?.route || "",
    sha256: doc ? currentChecksum(doc) : "",
    version: doc?.version,
    outcome: "ok",
    detail: `Extraction ${resultId} rejected by reviewer (decision: ${"reject" satisfies ExtractionApplyDecision})`,
  });
  return { ok: true, documentId };
}