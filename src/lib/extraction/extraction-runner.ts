/**
 * extraction-runner.ts — Phase 1.5b extraction pipeline orchestration.
 *
 * runExtraction(docId) →
 *   1. resolve the vault document (per-tenant, fail-closed on unknown id),
 *   2. deterministic text extraction (CSV/DOCX/XLSX/PDF) OR raster payload
 *      (PNG/JPEG/WebP/GIF → vision model),
 *   3. deterministic quality pre-checks (oversize / empty-text / zero bytes),
 *   4. ONE LLM call (classification + per-type extraction + quality),
 *   5. parse + validate + clamp confidence, build the ExtractionResult,
 *   6. persist the result (durable, per-tenant) + append an IMMUTABLE vault
 *      audit entry (actor, tenant, documentId, version, sha256, outcome).
 *
 * The runner NEVER writes document metadata and NEVER files anything. Applying
 * a result is a separate gated action (extraction-gate.ts). Unparseable or
 * low-confidence output becomes a pending_review result the human lane can see
 * and reject — never silent garbage, never an auto-write.
 */
import {
  clampConfidence,
  EXTRACTION_MIN_TEXT_CHARS,
  EXTRACTION_MIN_CONFIDENCE,
  EXTRACTION_MAX_TEXT_CHARS,
  EXTRACTION_MAX_VISION_BYTES,
  type DocCategory,
  type ExtractionResult,
  type ExtractionRunOutcome,
} from "./extraction-types";
import { getVaultDocument, readVaultDocumentBytes } from "../vault-store";
import { appendVaultAudit } from "../vault-audit";
import { buildExtractPayload } from "./text-extractor";
import { buildSystemPrompt, buildExtractionUserPrompt, EXTRACTION_FIELD_SCHEMAS } from "./extraction-prompts";
import { parseModelOutput, buildQuality } from "./extraction-parse";
import { saveExtraction, newExtractionId } from "./extraction-store";
import { createModelClient, resolveLlmConfig, type LlmMessage, type ModelClient } from "../llm/modelClient";

export interface RunExtractionOpts {
  tenantEmail: string;
  documentId: string;
  actor: string;
  dataDir: string;
  /** Injectable client (tests use MockModelClient; prod defaults to config). */
  client?: ModelClient;
  /** Injectable fingerprint for deterministic tests. */
  now?: () => Date;
  /** Override LLM enablement (tests can run without env config). */
  forceEnabled?: boolean;
  /** Category hint from workflow/upload metadata (optional). */
  docTypeHint?: DocCategory | string;
  maxVisionBytes?: number;
  maxTextChars?: number;
}

export async function runExtraction(opts: RunExtractionOpts): Promise<ExtractionRunOutcome> {
  const {
    tenantEmail,
    documentId,
    actor,
    dataDir,
    client,
    now = () => new Date(),
    docTypeHint,
    maxVisionBytes = EXTRACTION_MAX_VISION_BYTES,
    maxTextChars = EXTRACTION_MAX_TEXT_CHARS,
  } = opts;

  // 1. Resolve the document — fail closed: an id from another tenant, or an
  //    unknown id, is null and we never guess.
  const doc = getVaultDocument(dataDir, tenantEmail, documentId);
  if (!doc) return { ok: false, error: "unknown-document", detail: "No document with that id for this tenant" };
  const latest = doc.versions[doc.versions.length - 1];
  if (!latest) return { ok: false, error: "invalid-input", detail: "Document has no readable version" };
  const bytes = readVaultDocumentBytes(dataDir, tenantEmail, documentId)?.bytes;
  if (!bytes || bytes.byteLength === 0) {
    return recordError(dataDir, tenantEmail, doc, actor, "quality-blocked", "Empty file (0 bytes)", now);
  }

  const deterministicFlags: ExtractionResult["quality"]["flags"] = [];
  let modelVisible: { text?: string; dataUrl?: string; mime?: string } = {};

  // 2. Payload per format.
  const payload = buildExtractPayload(latest.mime, latest.ext, bytes);
  if (payload.kind === "raster") {
    if (bytes.byteLength > maxVisionBytes) {
      deterministicFlags.push({ code: "oversize", source: "deterministic", detail: `${bytes.byteLength} bytes > ${maxVisionBytes} vision cap` });
      return recordReviewOnly(dataDir, tenantEmail, doc, actor, "Vision model input too large for inline submission", deterministicFlags, now);
    }
    modelVisible = { dataUrl: payload.dataUrl, mime: payload.mime };
  } else if (payload.kind === "text") {
    if (payload.text.length < EXTRACTION_MIN_TEXT_CHARS) {
      deterministicFlags.push({ code: "empty-text", source: "deterministic", detail: "No embedded text found (scanned PDF or corrupt office file)" });
      return recordReviewOnly(dataDir, tenantEmail, doc, actor, "No readable text layer — human review required", deterministicFlags, now);
    }
    modelVisible = { text: payload.text.slice(0, maxTextChars) };
  } else {
    // No payload for a TEXT format means the extractor found no text layer.
    const isTextFormat = ["pdf", "docx", "xlsx", "csv"].includes(latest.ext);
    deterministicFlags.push(
      isTextFormat
        ? { code: "empty-text", source: "deterministic", detail: "No embedded text found (scanned PDF or corrupt office file)" }
        : { code: "unreadable", source: "deterministic", detail: "Unsupported or corrupt payload" },
    );
    return recordReviewOnly(
      dataDir,
      tenantEmail,
      doc,
      actor,
      isTextFormat ? "No readable text layer — human review required" : "Unsupported or corrupt document payload",
      deterministicFlags,
      now,
    );
  }

  // 3. One LLM pass.
  const model = client ?? createModelClient(resolveLlmConfig());
  const categoryHint: DocCategory = docTypeHint && (["invoice", "receipt", "contract", "id", "letter", "report", "photo", "other"] as const).includes(docTypeHint as DocCategory)
    ? (docTypeHint as DocCategory)
    : "other";
  const messages: LlmMessage[] = [
    { role: "system", content: buildSystemPrompt(categoryHint) },
    {
      role: "user",
      content: buildExtractionUserPrompt({
        fileName: doc.name,
        size: bytes.byteLength,
        text: modelVisible.text,
        dataUrl: modelVisible.dataUrl,
        docTypeHint,
      }),
      images: modelVisible.dataUrl ? [{ dataUrl: modelVisible.dataUrl }] : undefined,
    },
  ];

  const result = await model.complete({ messages, tier: "strong", temperature: 0, maxTokens: 1800 });
  if (result.kind === "notConfigured") {
    return { ok: false, error: "not-configured", detail: "LLM layer is disabled for this deployment — extraction unavailable" };
  }
  if (result.kind === "error") {
    return recordError(dataDir, tenantEmail, doc, actor, "model-error", `Model call failed: ${result.message}`, now);
  }

  // 4. Parse + validate (hostile-input-safe).
  const parsed = parseModelOutput(result.content, categoryHint);
  if (!parsed.category && parsed.flags.some((f) => f.code === "unreadable")) {
    return recordError(dataDir, tenantEmail, doc, actor, "unparseable-output", "Model output did not parse to JSON", now);
  }

  // Low-confidence (category or any field below the floor) → human-review lane
  // (spec 5b §4): low confidence is never silently written or auto-applied.
  // Absent OPTIONAL fields (empty value) are NOT low-confidence; a missing
  // REQUIRED field (e.g. no amount on an invoice) is.
  const requiredKeys = new Set(
    (EXTRACTION_FIELD_SCHEMAS[parsed.category ?? "other"] || []).filter((f) => f.required).map((f) => f.key),
  );
  const lowConfidence =
    parsed.categoryConfidence < EXTRACTION_MIN_CONFIDENCE ||
    parsed.fields.some(
      (f) =>
        (f.confidence < EXTRACTION_MIN_CONFIDENCE && f.value !== "") ||
        (requiredKeys.has(f.key) && f.value === ""),
    ) ||
    (parsed.lineItems || []).some((li) => li.confidence < EXTRACTION_MIN_CONFIDENCE);
  const quality = buildQuality(parsed.flags, deterministicFlags, parsed.readable ? 1 : 0.3, lowConfidence);
  const category: DocCategory = parsed.category || "other";
  const createdAt = now().toISOString();
  const extraction: ExtractionResult = {
    id: newExtractionId(),
    docId: doc.id,
    version: doc.version,
    tenantEmail,
    sha256: latest.sha256,
    fileName: doc.name,
    ext: latest.ext,
    mime: latest.mime,
    size: latest.size,
    category,
    categoryConfidence: parsed.categoryConfidence,
    fields: parsed.fields,
    lineItems: parsed.lineItems.length ? parsed.lineItems : undefined,
    quality,
    suggestedRoute: parsed.suggestedRoute,
    suggestedTags: parsed.suggestedTags,
    textSnippet: modelVisible.text ? modelVisible.text.slice(0, 2000) : undefined,
    provider: model.provider,
    model: model.model || "",
    createdAt,
    status: "pending_review",
  };

  // 5. Persist durably + immutable audit.
  try {
    saveExtraction(dataDir, tenantEmail, extraction);
  } catch (e: any) {
    return { ok: false, error: "store-error", detail: `Failed to persist extraction: ${e?.message || String(e)}` };
  }
  appendVaultAudit(dataDir, tenantEmail, {
    actor,
    action: "vault.extraction",
    documentId: doc.id,
    route: doc.route,
    sha256: latest.sha256,
    version: doc.version,
    outcome: quality.requiresReview ? "pending" : "ok",
    detail: `category=${category} conf=${clampConfidence(parsed.categoryConfidence, 0)} flags=${quality.flags.map((f) => f.code).join(",") || "none"}`,
  });
  return { ok: true, result: extraction };
}

/** Persist a review-lane result (no LLM call) + audit. */
function recordReviewOnly(
  dataDir: string,
  tenantEmail: string,
  doc: any,
  actor: string,
  detail: string,
  deterministicFlags: ExtractionResult["quality"]["flags"],
  now: () => Date,
): ExtractionRunOutcome {
  const latest = doc.versions[doc.versions.length - 1];
  const createdAt = now().toISOString();
  const extraction: ExtractionResult = {
    id: newExtractionId(),
    docId: doc.id,
    version: doc.version,
    tenantEmail,
    sha256: latest.sha256,
    fileName: doc.name,
    ext: latest.ext,
    mime: latest.mime,
    size: latest.size,
    category: "other",
    categoryConfidence: 0, // nothing classified — review decides
    fields: [],
    quality: { flags: deterministicFlags, readableScore: 0.2, requiresReview: true },
    suggestedTags: [],
    provider: "deterministic",
    model: "",
    createdAt,
    status: "pending_review",
  };
  try {
    saveExtraction(dataDir, tenantEmail, extraction);
  } catch (e: any) {
    return { ok: false, error: "store-error", detail: `Failed to persist extraction: ${e?.message || String(e)}` };
  }
  appendVaultAudit(dataDir, tenantEmail, {
    actor,
    action: "vault.extraction",
    documentId: doc.id,
    route: doc.route,
    sha256: latest.sha256,
    version: doc.version,
    outcome: "pending",
    detail,
  });
  return { ok: false, error: "quality-blocked", detail, resultId: extraction.id };
}

/** Persist an error record so the human lane can see WHY a run failed. */
function recordError(
  dataDir: string,
  tenantEmail: string,
  doc: any,
  actor: string,
  error: "model-error" | "unparseable-output" | "quality-blocked",
  detail: string,
  now: () => Date,
): ExtractionRunOutcome & { resultId?: string } {
  const latest = doc.versions[doc.versions.length - 1];
  const createdAt = now().toISOString();
  const extraction: ExtractionResult = {
    id: newExtractionId(),
    docId: doc.id,
    version: doc.version,
    tenantEmail,
    sha256: latest.sha256,
    fileName: doc.name,
    ext: latest.ext,
    mime: latest.mime,
    size: latest.size,
    category: "other",
    categoryConfidence: 0,
    fields: [],
    quality: { flags: [{ code: error === "unparseable-output" ? "unreadable" : "unreadable", source: "deterministic" }], readableScore: 0.2, requiresReview: true },
    suggestedTags: [],
    provider: "error",
    model: "",
    createdAt,
    status: "pending_review",
    textSnippet: detail,
  };
  try {
    saveExtraction(dataDir, tenantEmail, extraction);
  } catch {
    // Audit is authoritative even if the detail record can't persist.
  }
  appendVaultAudit(dataDir, tenantEmail, {
    actor,
    action: "vault.extraction",
    documentId: doc.id,
    route: doc.route,
    sha256: latest.sha256,
    version: doc.version,
    outcome: "error",
    detail,
  });
  return { ok: false, error, detail, resultId: extraction.id };
}