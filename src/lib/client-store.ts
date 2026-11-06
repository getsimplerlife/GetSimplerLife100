/**
 * client-store.ts — the SERVER half of the client reference (slice 195a).
 *
 * The money path (proposals, invoices) must name a real client of THIS tenant
 * before a row is written. This module answers that question in one place, so
 * the two gates cannot drift apart, and it answers it in a fixed order:
 *
 *   1. NO ID AT ALL      → 400, a sentence that says what is missing.
 *   2. STORE UNREADABLE  → 503. `isStoreUnreadable` / `reportUnreadableStore`
 *      are the ONE mechanism slice 193 established for "the file exists and
 *      does not parse"; this is the same convention, not a second one. An
 *      unreadable store is NOT an empty one: answering "client not found" here
 *      would blame the caller for the server's own damage.
 *   3. UNKNOWN / OTHER TENANT → 400. The lookup only ever walks the caller's
 *      own rows (`store[tenantId]`), so another tenant's client id is simply
 *      not a client — the same answer as an id that never existed, which is
 *      what keeps the refusal from confirming another workspace's records.
 *   4. FOUND             → the id is handed back to be stored on the row.
 *
 * SERVER ONLY. This file imports `node:path` and the data store; the pages use
 * `client-ref.ts` (pure) instead, and must never import this.
 */
import { join } from "node:path";
import { readJSON, isStoreUnreadable, reportUnreadableStore } from "./data-store";
import {
  clientRequiredSentence,
  clientStoreUnreadableSentence,
  clientUnknownSentence,
  isClientRefShape,
} from "./client-ref";

/** The tenant-keyed client store the spine (189) writes: `{ email: rows[] }`. */
export const CLIENT_STORE_KEY = "tenant_clients.json";

export function clientStorePath(dataDir: string): string {
  return join(dataDir, CLIENT_STORE_KEY);
}

export type ClientRefReason = "client-required" | "unknown-client" | "client-store-unreadable";

/**
 * A refusal that carries its own HTTP status. The native gates throw this
 * BEFORE the approval queue (a never-valid write must never queue), and the
 * write result hands the status to the router so the caller gets 400 or 503
 * rather than the generic 500 a bare `Error` would produce.
 */
export class ClientRefError extends Error {
  readonly status: 400 | 503;
  readonly reason: ClientRefReason;
  constructor(message: string, status: 400 | 503, reason: ClientRefReason) {
    super(message);
    this.name = "ClientRefError";
    this.status = status;
    this.reason = reason;
  }
}

export type ClientRefLookup =
  | { ok: true; clientId: string }
  | { ok: false; status: 400 | 503; reason: ClientRefReason; error: string };

/**
 * Is this id a client of THIS tenant? Pure read — nothing is written, nothing
 * is repaired, and an unreadable file is left exactly as it is.
 */
export function lookupTenantClient(
  dataDir: string,
  tenantId: string,
  rawClientId: unknown,
  subject = "record",
): ClientRefLookup {
  // 1. Nothing to look up. Answered before the store is touched: the caller's
  //    own mistake does not depend on the state of a file.
  if (!isClientRefShape(rawClientId)) {
    return { ok: false, status: 400, reason: "client-required", error: clientRequiredSentence(subject) };
  }
  const clientId = rawClientId.trim();
  const path = clientStorePath(dataDir);

  // 2. The store exists and does not parse — the customer's data is intact and
  //    unknown to us, so nothing may be claimed about it.
  if (isStoreUnreadable(path)) {
    reportUnreadableStore(path, "lookupTenantClient");
    return { ok: false, status: 503, reason: "client-store-unreadable", error: clientStoreUnreadableSentence(subject) };
  }

  let store: unknown;
  try {
    store = readJSON(path);
  } catch {
    reportUnreadableStore(path, "lookupTenantClient");
    return { ok: false, status: 503, reason: "client-store-unreadable", error: clientStoreUnreadableSentence(subject) };
  }

  // A bare array is the legacy deployment-wide shape the spine refuses to
  // interpret (prod-server's readTenantRows, slice 189). We cannot tell which
  // rows belong to this tenant, so we cannot say "not found" — that is a 503,
  // never a 400. An EMPTY legacy array holds no rows at all and is safely empty.
  if (Array.isArray(store)) {
    if (store.length > 0) {
      reportUnreadableStore(path, "lookupTenantClient:legacy-shape");
      return { ok: false, status: 503, reason: "client-store-unreadable", error: clientStoreUnreadableSentence(subject) };
    }
    return { ok: false, status: 400, reason: "unknown-client", error: clientUnknownSentence() };
  }

  const rows = store && typeof store === "object" ? (store as Record<string, unknown>)[tenantId] : undefined;
  if (rows === undefined) {
    // No rows for this tenant: the store answered, and it holds no clients here.
    return { ok: false, status: 400, reason: "unknown-client", error: clientUnknownSentence() };
  }
  if (!Array.isArray(rows)) {
    reportUnreadableStore(path, "lookupTenantClient:bad-shape");
    return { ok: false, status: 503, reason: "client-store-unreadable", error: clientStoreUnreadableSentence(subject) };
  }

  // 3. Exact id, this tenant's rows only — the isolation is the lookup itself.
  const found = rows.some((row) => row && typeof row === "object" && (row as { id?: unknown }).id === clientId);
  if (!found) return { ok: false, status: 400, reason: "unknown-client", error: clientUnknownSentence() };

  // 4. Valid.
  return { ok: true, clientId };
}

/**
 * `lookupTenantClient` as an assertion: returns the id, or throws the refusal
 * (with its status) so the gates can validate before the queue and still answer
 * 400/503 at the router.
 */
export function assertTenantClient(
  dataDir: string,
  tenantId: string,
  rawClientId: unknown,
  subject = "record",
): string {
  const res = lookupTenantClient(dataDir, tenantId, rawClientId, subject);
  if (!res.ok) throw new ClientRefError(res.error, res.status, res.reason);
  return res.clientId;
}
