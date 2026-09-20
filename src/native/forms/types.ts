/**
 * native/forms/types.ts — Phase 1.3 native capability: FORMS BUILDER v1.
 *
 * Multi-step form definitions with:
 *   - conditional logic (per-field showWhen: eq/neq/contains on another field),
 *   - prefill (allow-listed fields seeded from caller context/query),
 *   - validation (type/required/pattern/number-range/select-membership/
 *     length caps) + file uploads (bounded, magic-byte-sniffed),
 *   - submissions become TYPED WORKFLOW EVENTS (reuse the Phase 1.1 webhook
 *     event registry + outbound publisher — seed: capture-lead form shape).
 *
 * Isolation: all tenant maps are `{ [tenantId]: ... }` (structural isolation,
 * same discipline as webhooks/docs); a form/submission id resolves ONLY under
 * its owning tenant (unknown/foreign id → fail-closed 404 upstream).
 * Every mutation is audited to an immutable per-tenant native-forms trail
 * (`native.form.*`). Public submission endpoints are slug-gated + idempotency-
 * keyed (replay → duplicate, never double-record); disabled forms fail closed.
 */

export type FormFieldType = "text" | "textarea" | "email" | "number" | "date" | "select" | "checkbox" | "file";

export interface FormVisibilityRule {
  field: string; // another field's key
  op: "eq" | "neq" | "contains";
  value: string;
}

export interface FormFieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string; // regex source, compiled server-side
}

export interface FormField {
  key: string; // strict slug [A-Za-z0-9_-]{1,40}
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[]; // select/checkbox choices (PDF-subset: string[] only)
  validation?: FormFieldValidation;
  showWhen?: FormVisibilityRule;
  /** Allowed upload extensions for type="file" (e.g. ["pdf","png","jpg"]). */
  fileTypes?: string[];
  maxFileBytes?: number;
}

export interface FormStep {
  id: string; // step_<random>
  title?: string;
  fields: FormField[];
}

export interface FormDefinition {
  id: string; // frm_<random> — never user-supplied
  tenantId: string;
  /** Public token used in the unauthenticated submit URL. */
  slug: string; // slug_<random> — user-supplied on create, immutable
  name: string;
  description: string;
  steps: FormStep[];
  /** Field keys allowed to be prefilled by the submit caller. */
  prefillKeys: string[];
  enabled: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface FormFileUpload {
  key: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  checksum: string; // sha256 of bytes
}

export interface FormSubmission {
  id: string; // sub_<random> — never user-supplied
  tenantId: string;
  formId: string;
  status: "received" | "processed";
  answers: Record<string, string | string[]>;
  files: FormFileUpload[];
  eventId: string | null; // native.form.submission event id (when published)
  submittedAt: string;
  submittedBy: string; // email or "anonymous"
  source: string;
}

export const NATIVE_FORMS_KEY = "native_forms.json";
export const NATIVE_FORMS_AUDIT_KEY = "native_forms_audit.json";
export const NATIVE_FORMS_SLUGS_KEY = "native_forms_slugs.json";
export const MAX_FORMS_PER_TENANT = 50;
export const MAX_SUBMISSIONS_PER_TENANT = 1000;
export const MAX_STEPS = 10;
export const MAX_FIELDS_PER_STEP = 25;
export const MAX_FIELD_KEY = 40;
export const MAX_FIELD_LABEL = 120;
export const MAX_FORM_NAME = 120;
export const MAX_FORM_DESCRIPTION = 500;
export const MAX_OPTIONS = 50;
export const MAX_OPTION_LEN = 200;
export const MAX_PREFILL_KEYS = 25;
export const MAX_ANSWERS_BYTES = 256 * 1024;
export const MAX_FILES_PER_SUBMISSION = 5;
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB per file
export const MAX_TOTAL_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB per submission
export const MAX_ANSWER_VALUE = 8000;
export const DEFAULT_MAX_FILE_BYTES = MAX_FILE_BYTES;
/** Files allowed by default when a field declares no fileTypes. */
export const DEFAULT_FILE_TYPES = ["pdf", "png", "jpg", "jpeg", "txt", "csv", "docx"];
export const FORM_SLUG_RE = /^slug_[a-zA-Z0-9]{8,40}$/;