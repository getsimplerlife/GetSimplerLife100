/**
 * pending-email-drain.ts — SLICE 201: the retry lane is READ, not just written.
 *
 * `pending_emails.json` was write-only: three call sites pushed undelivered
 * messages into it and NOTHING in the codebase ever read it back. A queue
 * nothing reads is a lie about durability — it looked like a retry lane and was
 * a graveyard. This module is the read half.
 *
 * Pure and dependency-free on purpose: the caller supplies the send function, so
 * the drain can be exercised without a mail lane and without touching the disk
 * (a test that drains must never send real mail).
 *
 * The rules, all fail-closed:
 *  - `sent === true`          → left alone (already delivered).
 *  - `abandonedAt` present    → left alone (already given up on, with a reason).
 *  - not an object            → left alone. Non-destruction: a row we do not
 *                               understand is never deleted or rewritten.
 *  - no recipient or subject  → abandoned ("cannot be addressed"), never sent.
 *  - older than `maxAgeMs`    → abandoned. A day-old password-reset code or
 *                               purchase confirmation is not worth delivering.
 *  - `attempts >= maxAttempts`→ abandoned (retries exhausted).
 *  - otherwise, while under `limit`, it is sent ONCE. `delivered: true` marks it
 *                               sent with the provider's messageId and channel;
 *                               anything else increments `attempts`, records
 *                               `lastError`, and abandons on the final attempt.
 *  - over `limit`             → untouched, picked up by a later drain.
 *
 * Nothing here ever writes `sent: true` on an attempt. Only a `delivered: true`
 * from the sender (which the shared sender sets only when a provider returned
 * its own messageId) marks a message delivered.
 */

/** The shape of one row in pending_emails.json, as far as the drain cares. */
export interface PendingEmailRow {
  [key: string]: unknown;
  to?: unknown;
  subject?: unknown;
  body?: unknown;
  timestamp?: unknown;
  sent?: unknown;
  attempts?: unknown;
  abandonedAt?: unknown;
  abandonedReason?: unknown;
}

/** What the sender reports back for ONE attempt. */
export interface DrainSendResult {
  /** TRUE only when a provider acknowledged with its own messageId. */
  delivered: boolean;
  channel?: string;
  messageId?: string;
  error?: string;
}

export interface DrainOptions {
  /** Wall clock used for age checks (injected so the test can move time). */
  now?: number;
  /** Messages older than this are abandoned instead of sent. Default 24h. */
  maxAgeMs?: number;
  /** Total attempts allowed per message. Default 3. */
  maxAttempts?: number;
  /** How many messages this drain may attempt. Default 10. */
  limit?: number;
}

export interface DrainOutcome {
  /** The new array to persist. Rows the drain did not touch are the SAME objects. */
  items: PendingEmailRow[];
  attempted: number;
  delivered: number;
  abandoned: number;
}

export const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_DRAIN_LIMIT = 10;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asAttempts(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Epoch ms of the row's timestamp, or null when it has no usable one. */
function rowTime(row: PendingEmailRow): number | null {
  const raw = row.timestamp;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const text = asText(raw);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Walk the queue once and return the array to persist. Never mutates the input:
 * an untouched row keeps its identity, a changed row is a new object.
 */
export async function drainPendingEmails(
  items: readonly PendingEmailRow[],
  send: (row: PendingEmailRow) => Promise<DrainSendResult>,
  opts: DrainOptions = {},
): Promise<DrainOutcome> {
  const now = opts.now ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const limit = opts.limit ?? DEFAULT_DRAIN_LIMIT;

  const out: PendingEmailRow[] = [];
  let attempted = 0;
  let delivered = 0;
  let abandoned = 0;

  for (const row of Array.isArray(items) ? items : []) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      out.push(row as PendingEmailRow); // unknown shape — never destroyed
      continue;
    }
    if (row.sent === true || asText(row.abandonedAt)) {
      out.push(row);
      continue;
    }

    const attempts = asAttempts(row.attempts);
    const to = asText(row.to);
    const subject = asText(row.subject);

    if (!to || !subject) {
      out.push({
        ...row,
        abandonedAt: new Date(now).toISOString(),
        abandonedReason: "no recipient or subject — this message cannot be addressed",
        attempts,
      });
      abandoned++;
      continue;
    }

    const sentAt = rowTime(row);
    if (sentAt !== null && now - sentAt > maxAgeMs) {
      out.push({
        ...row,
        abandonedAt: new Date(now).toISOString(),
        abandonedReason: `older than ${Math.round(maxAgeMs / 3_600_000)}h — not worth delivering late`,
        attempts,
      });
      abandoned++;
      continue;
    }

    if (attempts >= maxAttempts) {
      out.push({
        ...row,
        abandonedAt: new Date(now).toISOString(),
        abandonedReason: `retries exhausted after ${attempts} attempt(s)`,
        attempts,
      });
      abandoned++;
      continue;
    }

    if (attempted >= limit) {
      out.push(row); // over this drain's budget — a later drain picks it up
      continue;
    }

    attempted++;
    let result: DrainSendResult;
    try {
      result = await send(row);
    } catch (e: any) {
      result = { delivered: false, error: e?.message || String(e) };
    }

    const nextAttempts = attempts + 1;
    if (result.delivered === true && asText(result.messageId)) {
      out.push({
        ...row,
        sent: true,
        sentAt: new Date(now).toISOString(),
        messageId: asText(result.messageId),
        channel: asText(result.channel) || "unknown",
        attempts: nextAttempts,
        lastError: undefined,
      });
      delivered++;
      continue;
    }

    const error = asText(result.error) || "the provider did not acknowledge the message";
    const exhausted = nextAttempts >= maxAttempts;
    out.push({
      ...row,
      sent: false,
      attempts: nextAttempts,
      lastAttemptAt: new Date(now).toISOString(),
      lastError: error,
      ...(exhausted
        ? {
            abandonedAt: new Date(now).toISOString(),
            abandonedReason: `retries exhausted after ${nextAttempts} attempt(s): ${error}`,
          }
        : {}),
    });
    if (exhausted) abandoned++;
  }

  return { items: out, attempted, delivered, abandoned };
}

/** Rows still awaiting delivery — what an operator view should show. */
export function pendingEmailCount(items: readonly PendingEmailRow[]): number {
  return (Array.isArray(items) ? items : []).filter(
    (row) =>
      row &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      row.sent !== true &&
      !asText(row.abandonedAt),
  ).length;
}
