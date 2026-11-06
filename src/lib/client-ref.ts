/**
 * client-ref.ts — THE CLIENT REFERENCE ON THE MONEY PATH (slice 195a).
 *
 * THE GAP THIS FILLS. Slice 189 built the client spine and said, in its own
 * header, that wiring the money path to it was "the next slice and needs its
 * own brief — a half-wired invoice is worse than an unwired one." A proposal
 * and an invoice were about a customer the product could not name, so
 * quote-to-cash had nothing to loop over.
 *
 * This module is the PURE half of that wiring: the shape rule for a client id,
 * the sentences a refusal uses, and the display rule for a row that carries no
 * client at all. It is deliberately free of `node:fs` and of `fetch` because it
 * is imported by the server (which stores the rows), by the portal pages (which
 * render them) and by the native modules in between. The store-touching half
 * lives in `client-store.ts`, which only the server imports.
 *
 * TWO RULES, BOTH LEARNED THE HARD WAY:
 *   1. NOTHING IS GUESSED. A row written before this slice has no `clientId`.
 *      It is shown as "Unassigned" — an explicit label — never attached to a
 *      client by matching a name, an email or a creation date. Guessing would
 *      put one customer's quote on another customer's page.
 *   2. NOTHING IS DELETED OR REWRITTEN. Legacy rows keep reading exactly as
 *      they did; the writers still only ever append.
 */

/** The label a row with no client carries. Never a guess, never blank. */
export const UNASSIGNED_CLIENT_LABEL = "Unassigned";

/** Bound on a client id — the store's ids are UUIDs, so this is generous. */
export const MAX_CLIENT_REF_LENGTH = 80;

/**
 * The `clientId` a stored row carries, as a trimmed string. Absent, empty or
 * non-string (a legacy row, or a hand-edited store) reads as "" — which every
 * caller treats as "no client", never as a client named "".
 */
export function clientIdOf(row: unknown): string {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "";
  const value = (row as Record<string, unknown>).clientId;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Shape check only — "this could be a client id", NOT "this client exists".
 * Existence is a store question and the server answers it against the tenant's
 * own rows (`client-store.ts`). Kept separate so the shape rule cannot drift
 * between the gate, the router and the pages.
 */
export function isClientRefShape(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CLIENT_REF_LENGTH) return false;
  return !/\s/.test(trimmed);
}

/**
 * What to print for a row's client. Three genuinely different states, and the
 * page must not blur them:
 *   - no client on the row        → "Unassigned" (a legacy row; not a guess)
 *   - a client we can name        → that name
 *   - an id whose client is gone  → "Unknown client (<id>)", so a reader can
 *                                   tell it apart from an unassigned row.
 */
export function clientLabel(
  clientId: string | null | undefined,
  nameById: Record<string, string>,
): string {
  const id = typeof clientId === "string" ? clientId.trim() : "";
  if (!id) return UNASSIGNED_CLIENT_LABEL;
  const name = nameById[id];
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  return `Unknown client (${id})`;
}

/**
 * The rows that belong to one client, by exact id. A row with no client id can
 * never match — not even when the filter is "" — so an "unassigned" row can
 * never appear on some client's page.
 */
export function rowsForClient<T>(rows: readonly T[], clientId: string): T[] {
  const wanted = typeof clientId === "string" ? clientId.trim() : "";
  if (!wanted) return [];
  return rows.filter((row) => clientIdOf(row) === wanted);
}

// ── The sentences a refusal uses ────────────────────────────────────────────
// Each one leads with the wire field name (`clientId`), which is what
// `fieldErrorFrom` in form-field-error.ts maps onto the picker the page renders
// — the same discipline every other refusal in this product follows.

/** A create arrived with no client on it. Says what is missing, and nothing else. */
export function clientRequiredSentence(subject: string): string {
  return `clientId is required — pick the client this ${subject} belongs to`;
}

/**
 * The id names no client in THIS tenant. Deliberately does not say whether it
 * names a client in another tenant: confirming that would leak the existence of
 * another workspace's records.
 */
export function clientUnknownSentence(): string {
  return "clientId does not name a client in this workspace";
}

/**
 * The client store exists and does not parse (or holds a shape this server
 * refuses to interpret). NOT "client not found": an unreadable store is not an
 * empty one, and saying "not found" would be a lie about the customer's data.
 * Generic on purpose — no path, no parse detail, no row count.
 */
export function clientStoreUnreadableSentence(subject: string): string {
  return `This workspace's client list could not be read, so this ${subject} was not saved. Nothing was changed — please try again in a moment.`;
}
