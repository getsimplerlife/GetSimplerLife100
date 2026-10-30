/**
 * portal-primitives.ts — shared view-layer helpers for the four primitives
 * surfaced in slice 135: forms (1.3), tables (1.4), dashboards (3.6) and
 * webhooks (1.1).
 *
 * These helpers are PURE (except `authedJson`, the single fetch wrapper) so
 * the honesty rules they encode are unit-testable without a server:
 *
 *   1. A 401 from any read is a SIGNED-OUT state, never an empty list. The
 *      page must say "please sign in" instead of rendering zero rows as if
 *      that were the tenant's real data.
 *   2. Every other failure is surfaced with the server's own message.
 *   3. Client-side paging is stated as client-side: the tables router only
 *      accepts `?limit=` (no offset/cursor), so the page fetches up to the
 *      server cap and pages in the browser.
 *   4. Bar geometry is derived from the tenant's OWN run rows; a zero/empty
 *      series renders no bars at all (never a placeholder chart).
 */

/** Result of one authed API read/write. */
export type AuthedResult<T> =
  | { ok: true; data: T }
  | { ok: false; signedOut: boolean; error: string };

/** JSON body of a native route: `{ data }` on success, `{ error }` otherwise. */
interface NativeEnvelope {
  data?: unknown;
  error?: unknown;
}

/**
 * Fetch a native route with the tenant session cookie.
 * - 401 → `{ ok:false, signedOut:true }` (the page shows a sign-in state).
 * - other non-2xx → `{ ok:false, error }` with the server's message.
 * - 2xx → `{ ok:true, data: json.data ?? json }`.
 */
export async function authedJson<T>(url: string, init?: RequestInit): Promise<AuthedResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "include", ...init });
  } catch (error) {
    return { ok: false, signedOut: false, error: error instanceof Error ? error.message : "Network error" };
  }
  if (res.status === 401) {
    return { ok: false, signedOut: true, error: "Your session is not active." };
  }
  const json = (await res.json().catch(() => null)) as NativeEnvelope | null;
  if (!res.ok) {
    const message = typeof json?.error === "string" && json.error ? json.error : `Request failed (${res.status})`;
    return { ok: false, signedOut: false, error: message };
  }
  return { ok: true, data: (json?.data ?? json) as T };
}

/** JSON POST/DELETE helper (same failure semantics as authedJson). */
export function authedSend<T>(url: string, method: "POST" | "DELETE", body?: unknown): Promise<AuthedResult<T>> {
  return authedJson<T>(url, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
}

/** Page a client-side list. Unknown/out-of-range pages clamp to a real page. */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): {
  rows: T[];
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
} {
  const size = Math.max(1, Math.floor(pageSize));
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;
  const rows = items.slice(start, start + size);
  return {
    rows,
    page: current,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + rows.length,
  };
}

/**
 * Bar widths (percent of the largest absolute value) for a real value series.
 * All-zero or empty input → `[]` (callers render the numbers only, never an
 * invented chart).
 */
export function barWidths(values: readonly number[]): number[] {
  const finite = values.map((v) => (Number.isFinite(v) ? v : 0));
  const max = finite.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  if (max === 0) return [];
  return finite.map((v) => Math.round((Math.abs(v) / max) * 1000) / 10);
}

/** "a, b, c" → ["a","b","c"] (trimmed, de-duped, empties dropped). */
export function splitList(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const value = raw.trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/** Numbers as the tenant sees them — grouped, at most 2 decimals. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** ISO timestamp → locale string, or "" when absent/unparseable (no guessing). */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

/** A row value as display text (arrays/objects never leak "[object Object]"). */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => cellText(v)).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/** The schema slice a row editor needs (1.4 table fields / 1.3 form fields). */
export interface RowFieldSpec {
  key: string;
  type: string;
  required?: boolean;
}

/**
 * Turn a row editor's string inputs into the `data` object the 1.4 gated write
 * path accepts. Fail-closed and client-side only: empty optional values are
 * OMITTED (never sent as ""), numbers must be finite, JSON must parse, and a
 * missing required field is an error before any request is made. The server
 * validates again — this never weakens the gate.
 */
export function buildRowData(
  fields: readonly RowFieldSpec[],
  values: Record<string, string>,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = (values[field.key] ?? "").trim();
    if (!raw) {
      if (field.required) return { ok: false, error: `"${field.key}" is required` };
      continue;
    }
    if (field.type === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, error: `"${field.key}" must be a number` };
      data[field.key] = n;
    } else if (field.type === "boolean") {
      if (raw !== "true" && raw !== "false") return { ok: false, error: `"${field.key}" must be true or false` };
      data[field.key] = raw === "true";
    } else if (field.type === "json") {
      try {
        data[field.key] = JSON.parse(raw);
      } catch {
        return { ok: false, error: `"${field.key}" must be valid JSON` };
      }
    } else {
      data[field.key] = raw;
    }
  }
  return { ok: true, data };
}

/**
 * Field types accepted by the 1.4 tables router (`VALID_TABLE_TYPES` in
 * src/native/tables/types.ts). Mirrored here because the server module is
 * not client-bundle safe; `portal-primitives-guard` asserts the two lists
 * are identical, so drift fails the suite instead of the form.
 */
export const TABLE_FIELD_TYPES = ["text", "textarea", "number", "boolean", "date", "select", "email", "json"] as const;

/**
 * Field types accepted by the 1.3 forms router (`TYPES` in
 * src/native/forms/router.ts). Same drift guard as TABLE_FIELD_TYPES.
 */
export const FORM_FIELD_TYPES = ["text", "textarea", "email", "number", "date", "select", "checkbox", "file"] as const;
