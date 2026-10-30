/**
 * native/fileimport/parse.ts — PURE parsing, mapping and per-row validation.
 *
 * No I/O, no store access, no LLM: everything here is deterministic so it can
 * be unit-tested directly and so a preview can never write anything.
 *
 * Two rules drive the shape of this file:
 *   1. NEVER THROW ON THE FIRST BAD ROW. A file with 40 rows where row 7 is bad
 *      must report row 7's reasons and still report the other 39 — the user
 *      fixes their file once instead of 40 times. `validateFileImportRows`
 *      returns a per-row error list, never a single thrown message.
 *   2. NEVER HALF-WRITE. The commit path refuses the WHOLE file when any row is
 *      invalid (see gate.ts), so a per-row list plus an all-or-nothing write is
 *      what makes "a failed row does not partially write" true.
 *
 * XLSX: this build has NO spreadsheet parser dependency, and a binary workbook
 * cannot be parsed honestly by hand. XLSX uploads are therefore REJECTED with a
 * message that tells the user exactly what to do (save as CSV) instead of
 * accepting bytes we would silently mangle.
 */
import {
  MAX_FILE_IMPORT_BYTES,
  MAX_FILE_IMPORT_MAPPING,
  MAX_FILE_IMPORT_ROWS,
  MAX_SOURCE_FIELD_CHARS,
  MAX_TARGET_FIELD_CHARS,
  FILE_IMPORT_FORMATS,
  KB_ARTICLE_TARGET_FIELDS,
  type FileImportMapping,
  type FileImportRow,
  type FileImportRowError,
  type FileImportTarget,
  type FileImportTargetKind,
  type FileImportValidation,
} from "./types";
import { coerceCsvRow, parseImportContent, validateRowData } from "../tables/validate";
import type { TableDef } from "../tables/types";

/** Hard caps for the knowledge-base article target (mirrors KB slice caps). */
const MAX_KB_TITLE = 160;
const MAX_KB_BODY = 20000;
const MAX_KB_TAGS = 10;
const MAX_KB_TAG_CHARS = 40;

export type ParseResult = { ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string };

/** Normalize a user-supplied format string, rejecting formats we cannot parse. */
export function normalizeFormat(format: unknown): { ok: true; format: "csv" | "json" } | { ok: false; error: string } {
  const raw = typeof format === "string" ? format.trim().toLowerCase().replace(/^\./, "") : "";
  if (!raw) return { ok: false, error: "format is required (csv or json)" };
  if (raw === "xlsx" || raw === "xls" || raw === "xlsm") {
    return {
      ok: false,
      error:
        "Excel workbooks (.xlsx/.xls) are not supported in this build — no spreadsheet parser is bundled. Save the sheet as CSV (File → Save as → CSV) and upload that.",
    };
  }
  if (!(FILE_IMPORT_FORMATS as readonly string[]).includes(raw)) {
    return { ok: false, error: `unsupported format "${raw}" — upload CSV or JSON` };
  }
  return { ok: true, format: raw as "csv" | "json" };
}

/** Parse a raw upload into row objects. Caps are enforced here, first. */
export function parseFileContent(format: unknown, content: unknown): ParseResult {
  const fmt = normalizeFormat(format);
  if (!fmt.ok) return fmt;
  if (typeof content !== "string" || content.trim().length === 0) {
    return { ok: false, error: "file content is required" };
  }
  const bytes = Buffer.byteLength(content, "utf-8");
  if (bytes > MAX_FILE_IMPORT_BYTES) {
    return {
      ok: false,
      error: `File is ${bytes} bytes — the limit is ${MAX_FILE_IMPORT_BYTES} bytes (512 KiB). Split the file and import it in parts.`,
    };
  }
  const parsed = parseImportContent(fmt.format, content);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.rows.length === 0) return { ok: false, error: "the file contains no data rows" };
  if (parsed.rows.length > MAX_FILE_IMPORT_ROWS) {
    return {
      ok: false,
      error: `File has ${parsed.rows.length} data rows — the limit is ${MAX_FILE_IMPORT_ROWS} rows per import. Split the file and import it in parts.`,
    };
  }
  return { ok: true, rows: parsed.rows };
}

/** Source columns = union of keys, in first-seen order (stable for the UI). */
export function deriveColumns(rows: Record<string, unknown>[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push(key);
      }
    }
  }
  return cols;
}

/** Validate a mapping against the job's discovered columns and the target. */
export function validateMapping(
  mapping: unknown,
  columns: string[],
  targetKind: FileImportTargetKind,
  table: TableDef | null,
): { ok: true; mapping: FileImportMapping[] } | { ok: false; error: string } {
  if (!Array.isArray(mapping)) return { ok: false, error: "mapping must be an array of {sourceField, targetField}" };
  if (mapping.length === 0) return { ok: false, error: "mapping must map at least one column" };
  if (mapping.length > MAX_FILE_IMPORT_MAPPING) {
    return { ok: false, error: `mapping must be ${MAX_FILE_IMPORT_MAPPING} fields or fewer` };
  }
  const targetFields = targetFieldKeys(targetKind, table);
  const sourceSet = new Set(columns);
  const seen = new Set<string>();
  const out: FileImportMapping[] = [];
  for (const item of mapping) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "each mapping entry must be an object" };
    }
    const entry = item as { sourceField?: unknown; targetField?: unknown };
    const sourceField = typeof entry.sourceField === "string" ? entry.sourceField.trim() : "";
    const targetField = typeof entry.targetField === "string" ? entry.targetField.trim() : "";
    if (!sourceField || sourceField.length > MAX_SOURCE_FIELD_CHARS) {
      return { ok: false, error: `sourceField must be 1–${MAX_SOURCE_FIELD_CHARS} characters` };
    }
    if (!targetField || targetField.length > MAX_TARGET_FIELD_CHARS) {
      return { ok: false, error: `targetField must be 1–${MAX_TARGET_FIELD_CHARS} characters` };
    }
    if (!sourceSet.has(sourceField)) return { ok: false, error: `sourceField "${sourceField}" is not a column in this file` };
    if (!targetFields.includes(targetField)) {
      return { ok: false, error: `targetField "${targetField}" is not a field of the chosen target` };
    }
    if (seen.has(targetField)) return { ok: false, error: `targetField "${targetField}" is mapped twice` };
    seen.add(targetField);
    out.push({ sourceField, targetField });
  }
  return { ok: true, mapping: out };
}

/** Target fields available for a target kind (drives the mapping UI too). */
export function targetFieldKeys(targetKind: FileImportTargetKind, table: TableDef | null): string[] {
  if (targetKind === "table") return table ? table.fields.map((f) => f.key) : [];
  return [...KB_ARTICLE_TARGET_FIELDS];
}

/** Stable de-dupe key: sorted-key JSON so key order can never fake a match. */
export function stableKey(record: Record<string, unknown>): string {
  const keys = Object.keys(record).sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys) ordered[k] = record[k];
  return JSON.stringify(ordered);
}

/** De-dupe key for a knowledge-base article (title, case/space-insensitive). */
export function kbTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Knowledge-base article validation — the second real target store. */
function validateKbRow(record: Record<string, unknown>): { ok: true; data: Record<string, unknown> } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const title = asString(record.title).trim();
  if (!title) reasons.push('Field "title" is required');
  else if (title.length > MAX_KB_TITLE) reasons.push(`Field "title" exceeds ${MAX_KB_TITLE} characters`);
  const body = asString(record.body);
  if (body.length > MAX_KB_BODY) reasons.push(`Field "body" exceeds ${MAX_KB_BODY} characters`);
  const rawTags = record.tags;
  let tags: string[] = [];
  if (rawTags !== undefined && rawTags !== null && rawTags !== "") {
    const parts = Array.isArray(rawTags) ? rawTags.map((t) => asString(t)) : asString(rawTags).split(",");
    tags = parts.map((t) => t.trim()).filter((t) => t.length > 0);
    if (tags.length > MAX_KB_TAGS) reasons.push(`Field "tags" exceeds ${MAX_KB_TAGS} tags`);
    const tooLong = tags.find((t) => t.length > MAX_KB_TAG_CHARS);
    if (tooLong) reasons.push(`Field "tags" has a tag longer than ${MAX_KB_TAG_CHARS} characters`);
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, data: { title, body, tags } };
}

/**
 * Map every staged row through the mapping and validate it against the target.
 * Returns the valid records (ready to write), a PER-ROW error list, and the
 * rows skipped as duplicates. Never throws for a bad row.
 */
export function validateFileImportRows(input: {
  targetKind: FileImportTargetKind;
  table: TableDef | null;
  mapping: FileImportMapping[];
  rows: FileImportRow[];
  /** De-dupe keys already present in the target store (skip policy). */
  existingKeys?: Set<string>;
}): FileImportValidation {
  const { targetKind, table, mapping, rows } = input;
  const existing = input.existingKeys ?? new Set<string>();
  const seenInFile = new Set<string>();
  const errors: FileImportRowError[] = [];
  const records: Record<string, unknown>[] = [];
  const skippedRowNumbers: number[] = [];

  if (mapping.length === 0) {
    // No mapping yet: report it once, per row, rather than pretending rows are fine.
    for (const row of rows) errors.push({ rowNumber: row.rowNumber, reasons: ["no column mapping has been saved for this import"] });
    return { total: rows.length, valid: 0, skipped: 0, invalid: rows.length, errors, records, skippedRowNumbers };
  }

  for (const row of rows) {
    // 1. Project the source row through the mapping.
    const projected: Record<string, unknown> = {};
    for (const m of mapping) projected[m.targetField] = row.values[m.sourceField];

    // 2. Coerce + validate against the REAL target schema.
    let data: Record<string, unknown>;
    if (targetKind === "table") {
      if (!table) {
        errors.push({ rowNumber: row.rowNumber, reasons: ["the target table no longer exists"] });
        continue;
      }
      const coerced = coerceCsvRow(table, projected);
      const check = validateRowData(table, coerced);
      if (!check.ok) {
        errors.push({ rowNumber: row.rowNumber, reasons: check.errors });
        continue;
      }
      data = check.data;
    } else {
      const check = validateKbRow(projected);
      if (!check.ok) {
        errors.push({ rowNumber: row.rowNumber, reasons: check.reasons });
        continue;
      }
      data = check.data;
    }

    // 3. De-dupe policy = SKIP (never update/overwrite).
    const key = targetKind === "table" ? stableKey(data) : kbTitleKey(asString(data.title));
    if (existing.has(key) || seenInFile.has(key)) {
      skippedRowNumbers.push(row.rowNumber);
      continue;
    }
    seenInFile.add(key);
    records.push(data);
  }

  return {
    total: rows.length,
    valid: records.length,
    skipped: skippedRowNumbers.length,
    invalid: errors.length,
    errors,
    records,
    skippedRowNumbers,
  };
}

/** Target validation shared by create/upload (fail-closed before anything is stored). */
export function describeTarget(target: FileImportTarget): string {
  return target.kind === "table" ? `table ${target.tableId ?? "?"}` : "knowledge-base articles";
}
