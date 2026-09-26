/**
 * native/transform/types.ts — Phase 3.5 native DATA TRANSFORMS & EDI/X12
 * tooling (JSON/XML/CSV mapping UI, XPath-subset paths, EDI X12/EDIFACT
 * parse + generate). Discipline mirrors 2.1–3.4 exactly:
 *   - tenant-keyed store + durable pending-write mirror + immutable
 *     native.transform.* audit; server-assigned ids ONLY (trf_/trn_/trw_),
 *   - every write rides the Approval Queue verb-first: createTransform /
 *     updateTransform / activateTransform / archiveTransform / deleteTransform
 *     / runTransform (verbs `run` + `activate` ADDED to WRITE_VERB this slice;
 *     the classification test asserts every one is a WRITE — standing
 *     fail-open control, 2.5/3.1/3.2/3.3/3.4 lesson),
 *   - validation BEFORE the gate: bad body / unknown ids / forged create-ids /
 *     template refs outside the field map / caps / unparseable source NEVER
 *     queue (the run is computed at queue time AND re-validated at apply),
 *   - deterministic PURE computation — NO LLM anywhere in this slice (the
 *     3.3 model client is never imported; the suite stays LLM-free),
 *   - the run OUTPUT lives in this slice's own tenant-keyed store: mapped
 *     rows (ready for the 1.4 tables lane's OWN gated createTableRow card)
 *     and/or a generated artifact (CSV/JSON/XML/X12/EDIFACT text). No
 *     cross-store writes: writing to 1.4 records is a SEPARATE approval card
 *     on the tables slice (already WRITE_VERB-classified) — no double-queue,
 *   - typed events native.transform.* via the Phase 1.1 registry; authed-only
 *     surface (401 fail-closed); NO public share lane (3.2/3.3 precedent).
 */
export type TransformSourceKind = "json" | "xml" | "csv" | "edi_x12" | "edifact";
export const TRANSFORM_SOURCE_KINDS: readonly TransformSourceKind[] = ["json", "xml", "csv", "edi_x12", "edifact"];
export type TransformOutputMode = "records" | "artifact";
export type ArtifactKind = "csv" | "json" | "xml" | "edi_x12" | "edifact";
export const ARTIFACT_KINDS: readonly ArtifactKind[] = ["csv", "json", "xml", "edi_x12", "edifact"];
export type CoerceKind = "string" | "number" | "int" | "bool" | "trim" | "upper" | "lower";
export const COERCE_KINDS: readonly CoerceKind[] = ["string", "number", "int", "bool", "trim", "upper", "lower"];
/** One field-mapping entry: source path (kind-specific) → target field. */
export interface FieldMapping {
  /** Kind-specific source selector (json dot-path / xpath-subset / csv
   *  column or #n / EDI SEG.element). */
  source: string;
  /** Target field name (also the {placeholder} name used in EDI templates). */
  target: string;
  coerce?: CoerceKind | null;
  required?: boolean;
}
/** Artifact generation config (validated at create/update BEFORE the gate). */
export interface GenerationConfig {
  /** CSV: delimiter (default ","), hasHeader (default true). */
  delimiter?: string;
  hasHeader?: boolean;
  /** XML: root + row element names (defaults records/row). */
  rootTag?: string;
  rowTag?: string;
  /** EDI: sender/receiver qualifiers (envelope control block). */
  senderId?: string;
  receiverId?: string;
  /** EDI: segment templates with {target} placeholders, e.g.
   *  "BEG*00*SA*{poNumber}*{date}" (X12) or "LIN+1+{sku}" (EDIFACT).
   *  Every placeholder must exist in the transform's field map. */
  segments?: string[];
  /** "x12_850" wraps segments in ISA/GS/ST/SE/GE/IEA (SPL/PO envelope);
   *  "edifact_orders" wraps in UNA/UNB/UNH/UNT/UNZ. */
  envelope: "x12_850" | "edifact_orders" | "none";
}
export interface TransformRecord {
  id: string; // trf_<random> — server-assigned
  tenantId: string;
  name: string;
  description: string;
  sourceKind: TransformSourceKind;
  outputMode: TransformOutputMode;
  /** outputMode "artifact" only — which artifact to generate. */
  artifactKind?: ArtifactKind | null;
  /** outputMode "records" only — optional 1.4 table the rows target
   *  (validated to EXIST at run time; the actual row write is a separate
   *  createTableRow approval card on the tables slice). */
  targetTableId?: string | null;
  /** Record-selection path (kind-specific), e.g. "orders.*" (json),
   *  "/orders/order" (xml), "rows" (csv), "transactions.*" (edi). */
  recordPath: string;
  fields: FieldMapping[];
  generation?: GenerationConfig | null;
  status: "draft" | "active" | "archived"; // draft→active→archived (terminal)
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
/** One mapped output row (values coerced; null = mapping didn't resolve). */
export interface MappedRow {
  values: Record<string, string | number | boolean | null>;
}
/** Durable result of an applied transform run. */
export interface TransformRun {
  id: string; // trn_<random> — server-assigned
  tenantId: string;
  transformId: string;
  status: "applied" | "rejected";
  requestedBy: string;
  requestedAt: string;
  appliedAt?: string;
  /** rows mode: the mapped rows (validated + capped). */
  rows?: MappedRow[];
  /** artifact mode: the generated text + mime. */
  artifact?: { mime: string; text: string } | null;
  rowCount: number;
  /** First N chars of the source (audit trail — full source is NOT retained). */
  sourceExcerpt?: string;
  targetTableId?: string | null;
  error?: string;
}
export type TransformOp = "create" | "update" | "activate" | "archive" | "delete" | "run";
export interface PendingTransformWrite {
  id: string; // trw_<random>
  tenantId: string;
  transformId: string | null;
  op: TransformOp;
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { transformId?: string; runId?: string; status?: string };
  error?: string;
}
// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_TRANSFORMS_PER_TENANT = 50;
export const MAX_FIELDS_PER_TRANSFORM = 25;
export const MAX_TRANSFORM_NAME = 120;
export const MAX_TRANSFORM_DESCRIPTION = 500;
export const MAX_SOURCE_BYTES = 512 * 1024; // ≤512KB per run
export const MAX_OUTPUT_ROWS = 1000;
export const MAX_PARSED_RECORDS = 5000;
export const MAX_PENDING_TRANSFORM_WRITES = 20;
export const MAX_RUNS_PER_TENANT = 200; // retention trim (first-in evicted)
export const MAX_RUN_SOURCE_EXCERPT = 4096;
export const MAX_ARTIFACT_TEXT_BYTES = 1024 * 1024;
export const MAX_GENERATION_SEGMENTS = 40;
// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_TRANSFORM_KEY = "native_transforms.json";
export const NATIVE_TRANSFORM_RUNS_KEY = "native_transform_runs.json";
export const NATIVE_TRANSFORM_PENDING_KEY = "native_transform_pending.json";
export const NATIVE_TRANSFORM_AUDIT_KEY = "native_transform_audit.json";