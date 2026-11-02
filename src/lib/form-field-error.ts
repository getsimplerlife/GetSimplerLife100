/**
 * lib/form-field-error.ts — SLICE 174: put a server validation message on the
 * FIELD that failed, not only in a page-level banner.
 *
 * THE DEFECT THIS CLOSES. Four portal composers (proposals, checklists, deal
 * rooms, invoices) handled a failed submit like this:
 *
 *     if (res.ok) … else { setError(j.error) }
 *     setTitle(""); setClientName(""); …          // ← runs on the error path too
 *
 * So a user who pasted a 10,000-character client name lost every field they had
 * typed and got one sentence in a banner at the top of the page — with no
 * indication which input the server was talking about. The server has always
 * named the field ("name must be ≤ 120 chars"); the page threw that away.
 *
 * This module turns the server's sentence into `{ field, message }` so the page
 * can mark that input `aria-invalid`, describe it with the message, and keep
 * every value the user typed. It is deliberately conservative: an unknown
 * sentence shape returns null and the caller keeps its banner, so nothing is
 * ever blamed on a field that the server did not name.
 */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * Server messages we map, all observed from the native validators:
 *   `name must be ≤ 120 chars`
 *   `Field "due" is not a real calendar date: 2026-02-31 does not exist`
 *   `clientEmail must be a valid email or empty`
 *   `description is required`
 */
const LEADING_FIELD_RE = /^(?:Field\s+"([^"]+)"|([A-Za-z][A-Za-z0-9_]*))\b/;

/** Map a server error message onto one of `known` fields, or null.
 *  `aliases` renames a wire field to the input the page actually renders
 *  (the invoice composer posts `linkedDealRoomId` but its select is `dealRoomId`). */
export function fieldErrorFrom(
  message: string,
  known: readonly string[],
  aliases: Record<string, string> = {},
): FieldError | null {
  const trimmed = (message ?? "").trim();
  if (!trimmed) return null;
  const m = LEADING_FIELD_RE.exec(trimmed);
  if (!m) return null;
  const candidate = m[1] ?? m[2] ?? "";
  if (!candidate || !known.includes(candidate)) return null;
  return { field: aliases[candidate] ?? candidate, message: trimmed };
}

/** Props to spread onto the input that failed — nothing at all when it is fine. */
export function fieldErrorProps(
  error: FieldError | null,
  field: string,
  id: string,
): { "aria-invalid"?: true; "aria-describedby"?: string } {
  if (!error || error.field !== field) return {};
  return { "aria-invalid": true, "aria-describedby": id };
}
