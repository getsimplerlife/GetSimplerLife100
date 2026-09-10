/**
 * extraction-types.ts — Phase 1.5b Document & File Intelligence: LLM extraction
 * pipeline shared types.
 *
 * The pipeline turns an uploaded vault document into a structured,
 * confidence-scored EXTRACTION RESULT: what the file IS (classification) plus
 * the fields the model read out of it. A result NEVER writes anything by
 * itself — applying extracted metadata/tags to a document is a separate,
 * Approval-Queue-gated action (see extraction-gate.ts).
 *
 * SAFETY FLOOR (owner mandate — holds in EVERY mode):
 *   - quality flags (blurry / unreadable / wrong-orientation / oversize /
 *     empty-text) push a result to the human-review lane instead of silent
 *     garbage being written,
 *   - every extraction is recorded durably per-tenant and appended to the
 *     immutable vault audit (actor, tenant, action, doc id, checksum, ts),
 *   - the LLM NEVER writes: output is parsed, validated, confidence-clamped,
 *     and only then offered to the human (or, in autonomy mode, to the same
 *     explicit non-glob allow-list + known-doc-id gate as any other write).
 */
import type { VaultFileExtension } from "../vault-types";

/** What the file IS. Classification happens in the same LLM pass as
 *  extraction (one vision/text call per document — cheaper, one audit). */
export type DocCategory =
  | "invoice"
  | "receipt"
  | "contract"
  | "id"
  | "letter"
  | "report"
  | "photo"
  | "other";

export const DOC_CATEGORIES: readonly DocCategory[] = [
  "invoice",
  "receipt",
  "contract",
  "id",
  "letter",
  "report",
  "photo",
  "other",
];

/** Instrument-level quality signals. `source` says whether the flag was
 *  computed locally (deterministic — bytes/size/length) or reported by the
 *  model (vision heuristics: blur, orientation, handwriting...). */
export type QualityFlagSource = "deterministic" | "model";

export interface ExtractionQualityFlag {
  code:
    | "blurry"
    | "unreadable"
    | "wrong-orientation"
    | "oversize"
    | "empty-text"
    | "handwritten";
  source: QualityFlagSource;
  detail?: string;
}

/** One extracted field: key + human label + typed value + 0..1 confidence. */
export interface ExtractionField {
  key: string;
  label: string;
  /** Raw string from the model (kept for the human-review lane). */
  value: string;
  /** Numeric interpretation when the field is money/count-like (null if n/a). */
  numberValue?: number | null;
  /** ISO date interpretation when the field is a date (null if n/a). */
  dateValue?: string | null;
  confidence: number; // 0..1 — low confidence forces human review
}

export interface ExtractionLineItem {
  description: string;
  quantity?: number | null;
  unitPrice?: number | null;
  amount?: number | null;
  confidence: number;
}

export interface ExtractionQuality {
  flags: ExtractionQualityFlag[];
  /** Model's own readability judgement (0..1). */
  readableScore: number;
  /** true when ANY flag is present → result must go to the human lane. */
  requiresReview: boolean;
}

export interface ExtractionResult {
  id: string;
  docId: string;
  /** Vault version the extraction ran against (results are version-bound). */
  version: number;
  tenantEmail: string;
  /** sha256 of the extracted version's bytes (ties result to content). */
  sha256: string;
  fileName: string;
  ext: VaultFileExtension;
  mime: string;
  size: number;
  // ── Classification ──
  category: DocCategory;
  categoryConfidence: number;
  // ── Structured fields (per-doc-type, see extraction-prompts.ts) ──
  fields: ExtractionField[];
  lineItems?: ExtractionLineItem[];
  // ── Quality / review lane ──
  quality: ExtractionQuality;
  /** Derived, model-suggested filing hints — NEVER applied without the gate. */
  suggestedRoute?: string;
  suggestedTags: string[];
  /** Best-effort extracted text (what the model was shown); "" for images. */
  textSnippet?: string;
  // ── Provenance ──
  provider: string; // LLM provider that produced the result ("off" when disabled)
  model: string;
  createdAt: string;
  /** Review-lane lifecycle (see extraction-store.ts). */
  status: "pending_review" | "applied" | "rejected";
  /** When status === "applied": id of the PendingAction that carried it. */
  appliedActionId?: string;
  appliedAt?: string;
}

/** What the user asked the pipeline to do with a result. */
export type ExtractionApplyDecision = "apply" | "reject";

/** Lightweight, human-review-lane-facing projection of a result. */
export interface ExtractionSummary {
  id: string;
  docId: string;
  fileName: string;
  ext: VaultFileExtension;
  category: DocCategory;
  categoryConfidence: number;
  qualityFlags: string[];
  requiresReview: boolean;
  status: ExtractionResult["status"];
  createdAt: string;
  appliedAt?: string;
}

export const EXTRACTION_MIN_CONFIDENCE = 0.55;
export const EXTRACTION_MAX_VISION_BYTES = 4 * 1024 * 1024; // 4 MiB inline to LLM
export const EXTRACTION_MAX_TEXT_CHARS = 12_000; // prompt budget for text formats
export const EXTRACTION_MAX_LINE_ITEMS = 100;

/** Threshold: text formats whose extracted text is shorter than this are
 *  flagged empty-text (scanned PDFs land here → human lane, no silent OCR). */
export const EXTRACTION_MIN_TEXT_CHARS = 8;

export const clampConfidence = (n: unknown, base: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : base;
  return Math.min(1, Math.max(0, v));
};

export interface ExtractionRunError {
  ok: false;
  /** "unknown-document" | "not-configured" | "model-error" |
   *  "unparseable-output" | "quality-blocked" | "store-error" | "invalid-input" */
  error: string;
  detail?: string;
  /** When the run still produced a durable record (e.g. unparseable output is
   *  recorded so the human lane can see WHY), carry it. */
  resultId?: string;
}

export type ExtractionRunOutcome = { ok: true; result: ExtractionResult } | ExtractionRunError;