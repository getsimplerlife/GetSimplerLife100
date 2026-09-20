/**
 * native/forms/logic.ts — validation, conditional visibility, prefill (1.3).
 *
 * All validation is SERVER-SIDE and fail-closed: unknown field keys rejected;
 * values constrained by type/required/pattern/range/select-membership/length
 * caps; file uploads bounded + magic-byte-sniffed (extension never trusted
 * alone). Conditional logic evaluates against the provided answers only
 * (a field hidden by a rule never validates). Prefill applies ONLY keys the
 * form author allow-listed (never arbitrary caller keys).
 */
import { createHash } from "node:crypto";
import {
  DEFAULT_FILE_TYPES,
  MAX_ANSWER_VALUE,
  MAX_FILES_PER_SUBMISSION,
  MAX_TOTAL_UPLOAD_BYTES,
  type FormDefinition,
  type FormField,
  type FormStep,
} from "./types";

export interface UploadFile {
  key: string;
  name: string;
  contentType: string;
  bytes: Uint8Array;
  checksum: string;
}
export type ValidatedResult =
  | { ok: true; answers: Record<string, string | string[]>; files: UploadFile[] }
  | { ok: false; errors: string[] }

/** Raw single-answer values as they arrive (before per-field coercion). */
export type RawAnswer = string | string[];

/** Collect every field of a form into a lookup (all steps flattened). */
export function allFieldsOf(form: FormDefinition): FormField[] {
  return form.steps.flatMap((s: FormStep) => s.fields);
}
export function fieldByKey(form: FormDefinition, key: string): FormField | null {
  return allFieldsOf(form).find((f) => f.key === key) ?? null;
}

/** Evaluate a showWhen rule against current answers (unknown rule → true). */
export function isFieldVisible(field: FormField, answers: Record<string, RawAnswer>): boolean {
  const rule = field.showWhen;
  if (!rule) return true;
  const raw = answers[rule.field];
  const value = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  switch (rule.op) {
    case "eq":
      return value === rule.value;
    case "neq":
      return value !== rule.value;
    case "contains":
      return value.includes(rule.value);
    default:
      return true;
  }
}

/** Merge caller prefill — ONLY form-declared prefillKeys are accepted. */
export function applyPrefill(
  form: FormDefinition,
  answers: Record<string, RawAnswer>,
  prefill: Record<string, RawAnswer> | undefined,
): Record<string, RawAnswer> {
  if (!prefill || typeof prefill !== "object") return answers;
  const out = { ...answers };
  for (const key of form.prefillKeys) {
    const v = prefill[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.length > MAX_ANSWER_VALUE) continue;
    if (Array.isArray(v)) {
      const clean = v.filter((x): x is string => typeof x === "string").slice(0, 50);
      if (clean.length > 0) out[key] = clean;
      continue;
    }
    if (typeof v === "string") out[key] = v;
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Magic-byte sniff — extension/contentType are NEVER trusted alone. */
export function sniffFileKind(bytes: Uint8Array): "pdf" | "png" | "jpg" | "other" {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return "other";
}
const EXT_OF_KIND: Record<string, string> = { pdf: "pdf", png: "png", jpg: "jpg", jpeg: "jpg" };

/**
 * Validate answers + uploads for a form. Returns {ok:true} with coerced
 * answers + file list, or {ok:false, errors}. Files with disallowed kinds are
 * rejected; hidden fields are ignored entirely (and their incoming values
 * dropped). Unknown keys → error (never guessed, never stored).
 */
export function validateSubmission(
  form: FormDefinition,
  answers: Record<string, RawAnswer>,
  uploads: { key: string; name: string; contentType: string; bytes: Uint8Array }[],
): ValidatedResult {
  const errors: string[] = [];
  const fields = allFieldsOf(form);
  const seen = new Set<string>();
  const outAnswers: Record<string, string | string[]> = {};
  const outFiles: UploadFile[] = [];
  let totalBytes = 0;
  const uploadTotal = uploads.reduce((n, u) => n + u.bytes.byteLength, 0);
  if (uploadTotal > MAX_TOTAL_UPLOAD_BYTES) errors.push(`Total upload exceeds ${MAX_TOTAL_UPLOAD_BYTES} bytes`);
  if (uploads.length > MAX_FILES_PER_SUBMISSION) {
    errors.push(`No more than ${MAX_FILES_PER_SUBMISSION} files per submission`);
  } else {
    const declaredFileKeys = new Set(fields.filter((f) => f.type === "file").map((f) => f.key));
    for (const u of uploads) {
      if (u.bytes.byteLength === 0) {
        errors.push(`File "${u.key}" is empty`);
        continue;
      }
      if (!declaredFileKeys.has(u.key)) {
        errors.push(`File key "${u.key}" is not a declared file field`);
        continue;
      }
      const field = fieldByKey(form, u.key)!;
      if (field.required && isFieldVisible(field, answers) && u.bytes.byteLength === 0) {
        errors.push(`File "${u.key}" is required`);
      }
      const cap = field.maxFileBytes ?? MAX_TOTAL_UPLOAD_BYTES;
      if (u.bytes.byteLength > cap) {
        errors.push(`File "${u.key}" exceeds ${cap} bytes`);
        continue;
      }
      const allowed = (field.fileTypes ?? DEFAULT_FILE_TYPES).map((e) => e.toLowerCase());
      const kind = sniffFileKind(u.bytes);
      const extOfName = u.name.toLowerCase().split(".").pop() ?? "";
      if (!allowed.includes(extOfName)) {
        errors.push(`File "${u.key}" must be one of: ${allowed.join(", ")}`);
        continue;
      }
      // Binary extensions must MATCH the magic bytes; text extensions must NOT
      // be a masqueraded binary (extension is never trusted alone).
      const binaryExt = EXT_OF_KIND[extOfName];
      const binaryOk = binaryExt ? binaryExt === kind : kind === "other";
      if (!binaryOk) {
        errors.push(`File "${u.key}" content does not match its .${extOfName} extension`);
        continue;
      }
      totalBytes += u.bytes.byteLength;
      outFiles.push({
        key: u.key,
        name: u.name.replace(/[^\w.\- ]/g, "_").slice(0, 120),
        contentType: u.contentType,
        bytes: u.bytes,
        checksum: requireSha256(u.bytes),
      });
    }
  }
  for (const field of fields) {
    seen.add(field.key);
    if (!isFieldVisible(field, answers)) continue; // hidden → ignore, even if present
    const raw = answers[field.key];
    const present = raw !== undefined && raw !== null && !(Array.isArray(raw) && raw.length === 0) && raw !== "";
    if (field.required && !present) {
      errors.push(`Field "${field.key}" (${field.label}) is required`);
      continue;
    }
    if (!present) continue;
    if (field.type === "file") {
      const uploadCount = outFiles.filter((f) => f.key === field.key).length;
      if (field.required && uploadCount === 0) errors.push(`Field "${field.key}" (${field.label}) requires a file`);
      continue; // file presence handled above
    }
    if (Array.isArray(raw)) {
      if (field.type !== "checkbox") {
        errors.push(`Field "${field.key}" must be a single value`);
        continue;
      }
      const cleaned = raw.filter((x): x is string => typeof x === "string" && x.length <= MAX_ANSWER_VALUE);
      for (const v of cleaned) {
        if (field.options && field.options.length > 0 && !field.options.includes(v)) {
          errors.push(`Field "${field.key}" has an invalid option "${v}"`);
        }
      }
      outAnswers[field.key] = cleaned;
      continue;
    }
    if (typeof raw !== "string") {
      errors.push(`Field "${field.key}" must be a string`);
      continue;
    }
    const value = raw.slice(0, MAX_ANSWER_VALUE);
    const v = field.validation;
    if (field.type === "email" && !EMAIL_RE.test(value)) {
      errors.push(`Field "${field.key}" is not a valid email`);
      continue;
    }
    if (field.type === "number") {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        errors.push(`Field "${field.key}" must be a number`);
        continue;
      }
      if (v?.min !== undefined && num < v.min) errors.push(`Field "${field.key}" must be >= ${v.min}`);
      if (v?.max !== undefined && num > v.max) errors.push(`Field "${field.key}" must be <= ${v.max}`);
    }
    if (v?.minLength !== undefined && value.length < v.minLength) errors.push(`Field "${field.key}" must be at least ${v.minLength} chars`);
    if (v?.maxLength !== undefined && value.length > v.maxLength) errors.push(`Field "${field.key}" must be at most ${v.maxLength} chars`);
    if (v?.pattern) {
      try {
        if (!new RegExp(v.pattern).test(value)) errors.push(`Field "${field.key}" does not match the required pattern`);
      } catch {
        errors.push(`Field "${field.key}" has an invalid pattern (server-side)`);
      }
    }
    if (field.type === "select" && field.options && field.options.length > 0 && !field.options.includes(value)) {
      errors.push(`Field "${field.key}" has an invalid option`);
      continue;
    }
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push(`Field "${field.key}" must be a date (YYYY-MM-DD)`);
      continue;
    }
    outAnswers[field.key] = value;
  }
  for (const key of Object.keys(answers)) {
    if (!seen.has(key)) errors.push(`Unknown field key "${key}" — not declared by the form`);
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, answers: outAnswers, files: outFiles };
}
function requireSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}