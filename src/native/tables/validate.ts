/**
 * native/tables/validate.ts — schema + row validation, CSV/JSON parsing (1.4).
 * All validation is SERVER-SIDE and fail-closed: unknown row keys rejected;
 * values type-checked (number finite / boolean / date YYYY-MM-DD / select
 * option membership / email / json bounded); row JSONB capped; import payload
 * bounded. Invalid writes never reach the approval gate.
 */
import {
  MAX_FIELD_KEY,
  MAX_FIELD_LABEL,
  MAX_OPTIONS,
  MAX_OPTION_LEN,
  MAX_ROW_JSON_BYTES,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_BYTES,
  MAX_TABLE_NAME,
  VALID_TABLE_TYPES,
  type TableDef,
  type TableField,
} from "./types";

export type Validated =
  | { ok: true; fields: TableField[] }
  | { ok: false; error: string };

const FIELD_KEY_RE = /^[A-Za-z0-9_-]{1,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a table schema definition (create/update). Fail-closed. */
export function validateTableSchema(input: {
  name: unknown;
  description?: unknown;
  fields: unknown;
}): Validated {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, MAX_TABLE_NAME) : "";
  if (!name) return { ok: false, error: "name is required" };
  if (!Array.isArray(input.fields) || input.fields.length === 0) return { ok: false, error: "fields must be a non-empty array" };
  if (input.fields.length > 30) return { ok: false, error: "no more than 30 fields" };
  const fields: TableField[] = [];
  const seen = new Set<string>();
  for (const raw of input.fields as unknown[]) {
    const f = raw as { key?: unknown; label?: unknown; type?: unknown; required?: unknown; options?: unknown };
    if (!f || typeof f !== "object") return { ok: false, error: "field must be an object" };
    const key = typeof f.key === "string" ? f.key : "";
    if (!FIELD_KEY_RE.test(key) || key.length > MAX_FIELD_KEY) return { ok: false, error: `field key "${key}" must be a slug [A-Za-z0-9_-]{1,40}` };
    if (seen.has(key)) return { ok: false, error: `duplicate field key "${key}"` };
    seen.add(key);
    const label = typeof f.label === "string" ? f.label.trim().slice(0, MAX_FIELD_LABEL) : "";
    if (!label) return { ok: false, error: `field "${key}" label is required` };
    const type = typeof f.type === "string" ? f.type : "";
    if (!(VALID_TABLE_TYPES as readonly string[]).includes(type)) return { ok: false, error: `field "${key}" has invalid type "${type}"` };
    const field: TableField = { key, label, type: type as TableField["type"] };
    if (f.required === true) field.required = true;
    if (Array.isArray(f.options)) {
      if (f.options.length > MAX_OPTIONS) return { ok: false, error: `field "${key}" exceeds ${MAX_OPTIONS} options` };
      const options: string[] = [];
      for (const o of f.options) {
        if (typeof o !== "string" || o.length === 0 || o.length > MAX_OPTION_LEN) return { ok: false, error: `field "${key}" has an invalid option` };
        if (!options.includes(o)) options.push(o);
      }
      field.options = options;
    }
    if (field.type === "select" && !field.options) return { ok: false, error: `select field "${key}" needs options` };
    fields.push(field);
  }
  return { ok: true, fields };
}

export type RowValidation = { ok: true; data: Record<string, unknown> } | { ok: false; errors: string[] };

/** Validate row data against a schema. Unknown keys fail closed. */
export function validateRowData(table: TableDef, data: unknown): RowValidation {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, errors: ["row data must be an object"] };
  const raw = data as Record<string, unknown>;
  const errors: string[] = [];
  const out: Record<string, unknown> = {};
  const seen = new Set<string>();
  for (const field of table.fields) {
    seen.add(field.key);
    const value = raw[field.key];
    const present = value !== undefined && value !== null && value !== "";
    if (field.required && !present) {
      errors.push(`Field "${field.key}" (${field.label}) is required`);
      continue;
    }
    if (!present) continue;
    switch (field.type) {
      case "text":
      case "textarea": {
        if (typeof value !== "string") { errors.push(`Field "${field.key}" must be a string`); continue; }
        if (value.length > 8000) { errors.push(`Field "${field.key}" exceeds 8000 chars`); continue; }
        break;
      }
      case "email": {
        if (typeof value !== "string" || !EMAIL_RE.test(value)) { errors.push(`Field "${field.key}" is not a valid email`); continue; }
        break;
      }
      case "number": {
        if (typeof value === "boolean" || typeof value !== "number" || !Number.isFinite(value)) { errors.push(`Field "${field.key}" must be a number`); continue; }
        break;
      }
      case "boolean": {
        if (typeof value !== "boolean") { errors.push(`Field "${field.key}" must be a boolean`); continue; }
        break;
      }
      case "date": {
        if (typeof value !== "string" || !DATE_RE.test(value)) { errors.push(`Field "${field.key}" must be a date (YYYY-MM-DD)`); continue; }
        break;
      }
      case "select": {
        if (typeof value !== "string" || (field.options && field.options.length > 0 && !field.options.includes(value))) {
          errors.push(`Field "${field.key}" must be one of: ${(field.options ?? []).join(", ")}`);
          continue;
        }
        break;
      }
      case "json": {
        let parsed: unknown;
        if (typeof value === "string") {
          try {
            parsed = JSON.parse(value);
          } catch {
            errors.push(`Field "${field.key}" must be valid JSON`); continue;
          }
        } else {
          parsed = value;
        }
        if (parsed === null || typeof parsed !== "object") { errors.push(`Field "${field.key}" must be a JSON object`); continue; }
        out[field.key] = parsed;
        continue;
      }
      default:
        errors.push(`Field "${field.key}" has an unsupported type`); continue;
    }
    out[field.key] = value;
  }
  for (const key of Object.keys(raw)) {
    if (!seen.has(key)) errors.push(`Unknown field key "${key}" — not in the table schema`);
  }
  const bytes = Buffer.byteLength(JSON.stringify(out), "utf-8");
  if (bytes > MAX_ROW_JSON_BYTES) errors.push(`Row data exceeds ${MAX_ROW_JSON_BYTES} bytes`);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: out };
}

/** Parse an import payload into row-data objects. format: csv | json. */
export function parseImportContent(format: string, content: string): { ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string } {
  if (typeof content !== "string" || content.length === 0) return { ok: false, error: "import content is required" };
  if (content.length > MAX_IMPORT_BYTES) return { ok: false, error: `import exceeds ${MAX_IMPORT_BYTES} bytes` };
  try {
    if (format === "json") {
      const parsed = JSON.parse(content) as unknown;
      let rows: unknown = null;
      if (Array.isArray(parsed)) rows = parsed;
      else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)) rows = (parsed as { rows: unknown[] }).rows;
      if (!Array.isArray(rows)) return { ok: false, error: "JSON import must be an array of row objects (or {rows: [...]})" };
      if (rows.length === 0) return { ok: false, error: "import contains no rows" };
      if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: `import exceeds ${MAX_IMPORT_ROWS} rows` };
      for (const r of rows) {
        if (!r || typeof r !== "object" || Array.isArray(r)) return { ok: false, error: "every row must be an object" };
      }
      return { ok: true, rows: rows as Record<string, unknown>[] };
    }
    if (format === "csv") {
      const rows = parseCsv(content);
      return { ok: true, rows };
    }
    return { ok: false, error: "format must be csv or json" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "import parse failed" };
  }
}

/** Minimal RFC-4180-ish CSV parser: quoted fields, embedded commas, CRLF. */
export function parseCsv(content: string): Record<string, unknown>[] {
  const lines: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const chars = content.replace(/\r\n/g, "\n").split("");
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (inQuotes) {
      if (c === '"') {
        if (chars[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); lines.push(row); row = []; field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); lines.push(row); }
  const filtered = lines.filter((r) => r.some((c) => c.trim() !== ""));
  if (filtered.length < 2) throw new Error("CSV needs a header row + at least one data row");
  const headers = filtered[0].map((h) => h.trim());
  const out: Record<string, unknown>[] = [];
  for (let i = 1; i < filtered.length; i++) {
    const record: Record<string, unknown> = {};
    for (let h = 0; h < headers.length; h++) record[headers[h]] = filtered[i][h] ?? "";
    out.push(record);
  }
  return out;
}

/**
 * Coerce CSV-derived string values to the table schema types BEFORE strict
 * validation: numbers from /^-?\d+(\.\d+)?$/, booleans from true/false
 * (case-insensitive). Anything else is left untouched and fails validation
 * (fail-closed) — no silent lossy casts, no "200" re-trimming.
 */
export function coerceCsvRow(table: TableDef, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of table.fields) {
    const v = row[field.key];
    if (typeof v !== "string" || v === "") { out[field.key] = v; continue; }
    const t = field.type;
    if (t === "number" && /^-?\d+(\.\d+)?$/.test(v.trim())) {
      out[field.key] = Number(v.trim());
    } else if (t === "boolean" && /^(true|false)$/i.test(v.trim())) {
      out[field.key] = v.trim().toLowerCase() === "true";
    } else {
      out[field.key] = v;
    }
  }
  return out;
}

/** Serialize rows to CSV (header from the table schema). */
export function toCsv(table: TableDef, rows: { data: Record<string, unknown> }[]): string {
  const headers = table.fields.map((f) => f.key);
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r.data[h])).join(","));
  return lines.join("\n");
}