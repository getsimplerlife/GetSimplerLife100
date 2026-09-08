/**
 * QuickBooks Online webhook receiver for the monitoring pipeline.
 *
 * Intuit QBO webhook contract (developer.intuit.com — webhooks guide):
 *  - When an endpoint URL is registered, Intuit POSTs legacy envelopes to it:
 *    `{ "eventNotifications": [ { "realmId": "...", "dataChangeEvent": {
 *    "entities": [ { "name": "Invoice", "id": "...", "operation": "Create",
 *    "lastUpdated": "..." } ] } } ] }` — this receiver parses that LEGACY
 *    format, NOT the newer cloud-event (CE) format.
 *  - EVERY request carries `intuit-signature` (the task/route spelling we
 *    accept is `X-Intuit-Signature`; HTTP header matching is case-insensitive)
 *    = base64( HMAC-SHA256( RAW request body, verifierToken ) ).
 *  - Intuit requires a FAST 2xx response. When the endpoint is saved, Intuit
 *    first POSTs a validation event with an empty `eventNotifications` array;
 *    we ACK it like any other valid payload (no receipts recorded).
 *
 * Fail-closed rules (owner mandate, mirror xero-webhook.ts):
 *  - QBO_WEBHOOK_VERIFIER unset -> 401, nothing recorded (no guessed tokens).
 *  - Missing / mismatched `intuit-signature` -> 401, nothing recorded.
 *    Constant-time compare throughout.
 *  - Malformed JSON / missing non-array `eventNotifications` / notification
 *    missing realmId or entities array -> 400.
 *  - Unknown entity names / operations are acknowledged but never recorded
 *    (they are not in our subscribed contracts).
 *  - Receiving a webhook NEVER deletes or mutates anything in the tenant org
 *    (non-destruction mandate). It only records a durable receipt; there are
 *    NO business handlers yet (receiver-only slice).
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readJSON, writeJSON } from "../lib/data-store";

/** The exact env var the Intuit "Show verifier token" value must be stored in. */
export const QBO_WEBHOOK_VERIFIER_ENV = "QBO_WEBHOOK_VERIFIER";
/** Intuit's signature header (case-insensitive): base64 HMAC-SHA256 of raw body. */
export const QBO_SIGNATURE_HEADER = "x-intuit-signature";
/** Canonical receiver route (what the Intuit "Set up endpoints" page is given). */
export const QBO_WEBHOOK_ROUTE = "/api/webhooks/quickbooks";
/** Receipt file name inside the data dir (provider-scoped, never credentials). */
export const QBO_RECEIPTS_FILE = "quickbooks_receipts.json";
const MAX_QBO_RECEIPTS = 200;

/** Entity name.operation -> monitor capability contract id (exact map, fail-closed). */
export const QBO_MONITOR_EVENT_MAP: Record<string, string> = {
  "Invoice.Create": "quickbooks-monitor-invoice-created",
  "Customer.Create": "quickbooks-monitor-customer-created",
};

export interface QboWebhookEntity {
  name?: string;
  id?: string;
  operation?: string;
  lastUpdated?: string;
}
export interface QboDataChangeEvent {
  entities?: QboWebhookEntity[];
}
export interface QboEventNotification {
  realmId?: string;
  dataChangeEvent?: QboDataChangeEvent;
}
export interface QboWebhookPayload {
  eventNotifications?: QboEventNotification[];
}
/**
 * Durable receipt for one mapped entity event. Carries exactly the fields the
 * monitor verification contracts need to later prove a REAL Intuit event
 * landed (timestamp, realmId, entity, operation, id, raw payload hash) plus the
 * capabilityId/eventId lookup keys. Never contains the raw body or credentials.
 */
export interface QboWebhookReceipt {
  capabilityId: string;
  eventId: string;
  entity: string;
  operation: string;
  realmId: string;
  id: string;
  rawPayloadHash: string;
  outcome: string;
  receivedAt: string;
}
export interface QboWebhookDeps {
  /** Returns the configured QBO_WEBHOOK_VERIFIER (undefined => fail closed). */
  getVerifierToken(): string | undefined;
  /** Persist a live-receipt record so the verification CLI can confirm receipt. */
  recordReceipt?(receipt: QboWebhookReceipt): void | Promise<void>;
}

/** Constant-time string equality (length-safe, no early exit). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
/** base64(HMAC-SHA256(rawBody, verifierToken)) — the Intuit signature scheme. */
export async function computeQboWebhookSignature(rawBody: string, verifierToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(verifierToken),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(rawBody));
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
/** hex(SHA-256(rawBody)) — durable evidence hash of the exact received bytes. */
export function qboRawPayloadHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
/**
 * Verify the `intuit-signature` header on a QBO event POST: base64
 * HMAC-SHA256 of the RAW body against the verifier token. Fail-closed.
 */
export async function verifyQboWebhookSignature(
  rawBody: string,
  headerValue: string | null,
  verifierToken: string,
): Promise<boolean> {
  if (!headerValue || !verifierToken) return false;
  const expected = await computeQboWebhookSignature(rawBody, verifierToken).catch(() => null);
  return expected !== null && constantTimeEqual(headerValue, expected);
}
/**
 * Parse the LEGACY Intuit payload envelope. Fail-closed:
 * eventNotifications must be an array; each notification must carry a non-empty
 * realmId and a dataChangeEvent.entities array. Entity-level fields are
 * validated at record time (entities missing name/id/operation are ignored,
 * never 400 the whole payload — a defensiveness choice for real Intuit data).
 */
export function parseQboWebhookPayload(rawBody: string): { ok: true; notifications: QboEventNotification[] } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "Invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "Payload must be a JSON object" };
  const notifications = (parsed as QboWebhookPayload).eventNotifications;
  if (!Array.isArray(notifications)) return { ok: false, reason: "Payload must contain an eventNotifications array" };
  for (const notification of notifications) {
    if (!notification || typeof notification !== "object") {
      return { ok: false, reason: "Each eventNotification must be an object" };
    }
    const note = notification as QboEventNotification;
    if (typeof note.realmId !== "string" || note.realmId.length === 0) {
      return { ok: false, reason: "Each eventNotification must carry a non-empty realmId" };
    }
    const dce = note.dataChangeEvent;
    if (!dce || typeof dce !== "object") {
      return { ok: false, reason: "Each eventNotification must carry a dataChangeEvent object" };
    }
    if (!Array.isArray(dce.entities)) {
      return { ok: false, reason: "Each dataChangeEvent must carry an entities array" };
    }
  }
  return { ok: true, notifications: notifications as QboEventNotification[] };
}
/** Exact entity name + operation -> monitor contract capability id (null = not subscribed). */
export function mapQboEntity(name: string | undefined, operation: string | undefined): string | null {
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof operation !== "string" || operation.length === 0) return null;
  return QBO_MONITOR_EVENT_MAP[`${name}.${operation}`] ?? null;
}
/** Stable event id for dedupe/receipt lookup. */
export function qboEventId(realmId: string, entity: { name?: string; id?: string; operation?: string }): string {
  return `qbo:${realmId}:${entity.name ?? "unknown"}:${entity.id ?? "no-id"}:${entity.operation ?? "unknown"}`;
}
/**
 * Full QBO webhook route handler.
 *  - POST -> verify `intuit-signature`, parse the legacy envelope, record a
 *    durable receipt for each subscribed (Invoice.Create / Customer.Create)
 *    entity, and ACK promptly (Intuit requires a fast 2xx). NO business
 *    dispatch yet — receiver-only slice.
 *  - anything else -> 405 (never the SPA HTML fallback on a webhook path).
 */
export async function handleQuickbooksWebhook(req: Request, deps: QboWebhookDeps): Promise<Response> {
  if (req.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed — POST required" }, { status: 405 });
  }
  const verifierToken = deps.getVerifierToken();
  if (!verifierToken) {
    console.error(`[monitor] QBO verifier token not configured (${QBO_WEBHOOK_VERIFIER_ENV}) — failing closed`);
    return Response.json({ error: "Webhook verifier token not configured" }, { status: 401 });
  }
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return Response.json({ error: "Failed to read body" }, { status: 400 });
  }
  const signature = req.headers.get(QBO_SIGNATURE_HEADER);
  if (!signature) {
    console.error("[monitor] QBO webhook signature header missing");
    return Response.json({ error: "Missing intuit-signature header" }, { status: 401 });
  }
  const valid = await verifyQboWebhookSignature(rawBody, signature, verifierToken);
  if (!valid) {
    console.error("[monitor] QBO webhook signature rejected");
    return Response.json({ error: "Invalid intuit-signature" }, { status: 401 });
  }
  const parsed = parseQboWebhookPayload(rawBody);
  if (!parsed.ok) {
    console.error(`[monitor] QBO webhook payload rejected: ${parsed.reason}`);
    return Response.json({ error: parsed.reason }, { status: 400 });
  }
  const rawPayloadHash = qboRawPayloadHash(rawBody);
  const recorded: QboWebhookReceipt[] = [];
  let ignored: string[] = [];
  for (const notification of parsed.notifications) {
    const realmId = notification.realmId ?? "";
    for (const entity of notification.dataChangeEvent?.entities ?? []) {
      if (!entity || typeof entity !== "object") continue;
      const capabilityId = mapQboEntity(entity.name, entity.operation);
      if (!capabilityId) {
        ignored.push(`${entity.name ?? "?"}.${entity.operation ?? "?"}`);
        continue;
      }
      if (typeof entity.id !== "string" || entity.id.length === 0) {
        // Cannot build a receipt without a known id — non-destruction: never
        // guess. Acknowledge and skip.
        ignored.push(`${entity.name}.${entity.operation}(no-id)`);
        continue;
      }
      const receipt: QboWebhookReceipt = {
        capabilityId,
        eventId: qboEventId(realmId, entity),
        entity: entity.name ?? "",
        operation: entity.operation ?? "",
        realmId,
        id: entity.id,
        rawPayloadHash,
        outcome: "received",
        receivedAt: new Date().toISOString(),
      };
      recorded.push(receipt);
      if (deps.recordReceipt) {
        try {
          await deps.recordReceipt(receipt);
        } catch (error) {
          console.error(
            "[monitor] Failed to record QBO webhook receipt:",
            error instanceof Error ? error.message : error,
          );
        }
      }
    }
  }
  console.log(
    `[monitor] QBO webhook: ${parsed.notifications.length} notification(s), recorded=${recorded.length} ignored=${ignored.length}`,
  );
  return Response.json({ received: true, acknowledged: recorded.length, ignored, receipts: recorded });
}
// ── Live-receipt log (evidence for the batch verification CLI) ───────────────
export function quickbooksReceiptsPath(dataDir: string): string {
  return join(dataDir, QBO_RECEIPTS_FILE);
}
/** Append a live-receipt record (bounded). Never stores credentials. */
export async function recordQboWebhookReceipt(receipt: QboWebhookReceipt, dataDir: string): Promise<void> {
  const file = quickbooksReceiptsPath(dataDir);
  const receipts: QboWebhookReceipt[] = Array.isArray(readJSON(file)) ? readJSON(file) : [];
  receipts.push(receipt);
  writeJSON(file, receipts.slice(-MAX_QBO_RECEIPTS));
}
export function readQboWebhookReceipts(dataDir: string): QboWebhookReceipt[] {
  const value = readJSON(quickbooksReceiptsPath(dataDir));
  return Array.isArray(value) ? (value as QboWebhookReceipt[]) : [];
}
/** Newest recorded receipt for a capability within `withinMs`, if any. */
export function latestQboWebhookReceipt(
  capabilityId: string,
  dataDir: string,
  withinMs: number,
): QboWebhookReceipt | undefined {
  const cutoff = Date.now() - withinMs;
  const matches = readQboWebhookReceipts(dataDir)
    .filter((r) => r.capabilityId === capabilityId)
    .filter((r) => new Date(r.receivedAt).getTime() >= cutoff);
  matches.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  return matches[0];
}