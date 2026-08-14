/**
 * Xero webhook receiver for the monitoring pipeline.
 *
 * Xero webhook contract (developer.xero.com — webhooks guide):
 *  - Handshake: when a webhook delivery URL is saved, Xero sends a GET request
 *    carrying the `Xero-Webhook-Key` header. The endpoint MUST answer HTTP 200
 *    with the webhook key echoed as the response body, or Xero never activates
 *    the webhook.
 *  - Events: Xero POSTs JSON `{ events: [...] }`; each event carries eventType
 *    (e.g. INVOICE.CREATED / BILL.CREATED), eventCategory, resourceUrl,
 *    resourceId, eventDateUtc and tenantId (the Xero org UUID).
 *  - Signature: Xero signs the RAW request body with HMAC-SHA256 using the
 *    webhook key as the secret; the base64 signature is sent in the
 *    `Xero-Webhook-Key` header of every POST. We also accept a plaintext
 *    key match (handshake-style) for robustness, but never process a request
 *    that fails both checks.
 *
 * Fail-closed rules (owner mandate):
 *  - XERO_WEBHOOK_KEY unset -> 503, nothing processed (no guessed keys).
 *  - Missing / mismatched key or signature -> 401, nothing processed.
 *  - Malformed JSON or a missing events array -> 400.
 *  - Unknown event types are acknowledged but never dispatched (they are not in
 *    our subscription). No guessed provider URLs anywhere — the only external
 *    host contacted is the canonical Xero connections API.
 *  - Receiving a webhook NEVER deletes or mutates anything in the tenant org
 *    (non-destruction mandate). It only records a receipt and dispatches to the
 *    monitoring pipeline, which is entitlement-gated.
 */
import { join } from "node:path";
import { readJSON, writeJSON } from "../lib/data-store";
import type { EventOutcome, MonitoredEvent } from "./types";

/** Header Xero uses for both the handshake key and the HMAC signature. */
export const XERO_WEBHOOK_HEADER = "xero-webhook-key";
/**
 * Xero's docs also send the base64 HMAC-SHA256 signature of the raw body in a
 * `Xero-Webhook-Signature` header — accepted as a fallback for POST events.
 */
export const XERO_WEBHOOK_SIGNATURE_HEADER = "xero-webhook-signature";
/** Canonical Xero connections API host (never guessed). */
export const XERO_CONNECTIONS_URL = "https://api.xero.com/connections";
/** Employee that owns the Xero monitor capability contracts. */
export const XERO_MONITOR_EMPLOYEE_ID = "invoice_ledger";

/** Xero eventType -> monitor capability contract id (exact map, fail-closed). */
export const XERO_MONITOR_EVENT_MAP: Record<string, string> = {
  "INVOICE.CREATED": "xero-monitor-invoice-created",
  "BILL.CREATED": "xero-monitor-bill-created",
};

export interface XeroWebhookEvent {
  resourceUrl?: string;
  resourceId?: string;
  eventDateUtc?: string;
  eventType: string;
  eventCategory?: string;
  tenantId?: string;
  tenantType?: string;
}

export interface XeroWebhookReceipt {
  capabilityId: string;
  eventId: string;
  eventType: string;
  tenantId: string;
  outcome: string;
  receivedAt: string;
}

export interface XeroWebhookDeps {
  /** Returns the configured XERO_WEBHOOK_KEY (undefined => fail closed). */
  getWebhookKey(): string | undefined;
  /**
   * Best-effort entitlement resolution for a Xero org UUID: when the org belongs
   * to an entitled (purchased) tenant, register the org as a monitoring gate and
   * return true. Never performs network I/O — the ack path must stay fast.
   */
  ensureOrgGate(orgId: string): Promise<boolean>;
  /** Dispatch a mapped event through the monitoring pipeline. */
  dispatch(event: MonitoredEvent): Promise<EventOutcome>;
  /** Persist a live-receipt record so the verification CLI can confirm receipt. */
  recordReceipt?(receipt: XeroWebhookReceipt): void | Promise<void>;
}

/** Constant-time string equality (length-safe, no early exit). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** base64(HMAC-SHA256(rawBody, webhookKey)) — the Xero POST signature scheme. */
export async function computeXeroWebhookSignature(rawBody: string, webhookKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookKey),
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

/**
 * Verify the Xero-Webhook-Key header on an event POST.
 * Accepts the current Xero scheme (base64 HMAC-SHA256 of the raw body) and the
 * plaintext key (handshake-style / some client setups). Fail-closed otherwise.
 */
export async function verifyXeroWebhookSignature(rawBody: string, headerValue: string | null, webhookKey: string): Promise<boolean> {
  if (!headerValue || !webhookKey) return false;
  if (constantTimeEqual(headerValue, webhookKey)) return true; // plaintext key
  const expected = await computeXeroWebhookSignature(rawBody, webhookKey).catch(() => null);
  return expected !== null && constantTimeEqual(headerValue, expected);
}

/** Parse the Xero POST envelope. Fail-closed: invalid JSON / no events array. */
export function parseXeroWebhookEvents(rawBody: string): { ok: true; events: XeroWebhookEvent[] } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "Invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, reason: "Payload must be a JSON object" };
  const events = (parsed as { events?: unknown }).events;
  if (!Array.isArray(events)) return { ok: false, reason: "Payload must contain an events array" };
  for (const event of events) {
    if (!event || typeof event !== "object") return { ok: false, reason: "Each event must be an object" };
    const evt = event as XeroWebhookEvent;
    if (typeof evt.eventType !== "string" || evt.eventType.length === 0) {
      return { ok: false, reason: "Each event must carry a non-empty eventType" };
    }
  }
  return { ok: true, events: events as XeroWebhookEvent[] };
}

/** Exact eventType -> monitor contract capability id (null = not in subscription). */
export function mapXeroEventType(eventType: string): string | null {
  return XERO_MONITOR_EVENT_MAP[eventType] ?? null;
}

/** Stable event id for dedupe/lease (Xero events have no id field of their own). */
export function xeroEventId(event: XeroWebhookEvent): string {
  return `xero:${event.tenantId ?? "unknown"}:${event.eventType}:${event.resourceId || event.resourceUrl || "no-resource"}`;
}

/** Build a MonitoredEvent for a mapped Xero event (requires a tenantId to dispatch). */
export function buildXeroMonitoredEvent(event: XeroWebhookEvent, capabilityId: string): MonitoredEvent {
  return {
    id: xeroEventId(event),
    employeeId: XERO_MONITOR_EMPLOYEE_ID,
    providerId: "xero",
    eventType: event.eventType,
    tenantId: event.tenantId,
    payload: {
      capabilityId,
      eventCategory: event.eventCategory,
      eventType: event.eventType,
      resourceUrl: event.resourceUrl,
      resourceId: event.resourceId,
      eventDateUtc: event.eventDateUtc,
      tenantId: event.tenantId,
      tenantType: event.tenantType,
    },
    receivedAt: new Date().toISOString(),
    signature: undefined,
  };
}

/**
 * Full Xero webhook route handler.
 *  - GET  -> handshake: 200 with the webhook key as the body (Xero activation).
 *  - POST -> events: verify signature, map INVOICE.CREATED/BILL.CREATED to
 *    monitor contracts, dispatch through the entitlement-gated pipeline, and
 *    ACK promptly with a compact outcome summary.
 *  - anything else -> 405.
 */
export async function handleXeroWebhook(req: Request, deps: XeroWebhookDeps): Promise<Response> {
  const method = req.method.toUpperCase();
  if (method === "GET") return handleXeroHandshake(req, deps);
  if (method !== "POST") {
    return Response.json({ error: "Method not allowed — GET (handshake) or POST (events) required" }, { status: 405 });
  }

  const webhookKey = deps.getWebhookKey();
  if (!webhookKey) {
    console.error("[monitor] Xero webhook key not configured (XERO_WEBHOOK_KEY) — failing closed");
    return Response.json({ error: "Webhook key not configured" }, { status: 503 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return Response.json({ error: "Failed to read body" }, { status: 400 });
  }

  const keyHeaderValue = req.headers.get(XERO_WEBHOOK_HEADER);
  const sigHeaderValue = req.headers.get(XERO_WEBHOOK_SIGNATURE_HEADER);
  const valid =
    (await verifyXeroWebhookSignature(rawBody, keyHeaderValue, webhookKey)) ||
    (sigHeaderValue ? await verifyXeroWebhookSignature(rawBody, sigHeaderValue, webhookKey) : false);
  if (!valid) {
    console.error("[monitor] Xero webhook signature rejected");
    return Response.json({ error: "Invalid Xero-Webhook-Key header" }, { status: 401 });
  }

  const parsed = parseXeroWebhookEvents(rawBody);
  if (!parsed.ok) {
    return Response.json({ error: parsed.reason }, { status: 400 });
  }

  const outcomes: Array<{ eventType: string; capabilityId: string; status: string; reason?: string }> = [];
  const ignored: string[] = [];

  for (const event of parsed.events) {
    const capabilityId = mapXeroEventType(event.eventType);
    if (!capabilityId) {
      ignored.push(event.eventType);
      continue; // not in our subscription — acknowledged, never dispatched
    }
    if (!event.tenantId) {
      outcomes.push({ eventType: event.eventType, capabilityId, status: "failed", reason: "Event has no tenantId" });
      continue;
    }
    let outcome: EventOutcome;
    try {
      await deps.ensureOrgGate(event.tenantId);
      outcome = await deps.dispatch(buildXeroMonitoredEvent(event, capabilityId));
    } catch (error) {
      outcome = { eventId: xeroEventId(event), status: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
    outcomes.push({
      eventType: event.eventType,
      capabilityId,
      status: outcome.status,
      reason: outcome.reason,
    });
    if (outcome.status === "processed") {
      try {
        await deps.recordReceipt?.({
          capabilityId,
          eventId: outcome.eventId || xeroEventId(event),
          eventType: event.eventType,
          tenantId: event.tenantId,
          outcome: outcome.status,
          receivedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("[monitor] Failed to record Xero webhook receipt:", error instanceof Error ? error.message : error);
      }
    }
  }

  const processed = outcomes.filter((o) => o.status === "processed").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;
  const failed = outcomes.filter((o) => o.status === "failed").length;
  console.log(`[monitor] Xero webhook: ${parsed.events.length} event(s), processed=${processed} skipped=${skipped} failed=${failed} ignored=${ignored.length}`);
  return Response.json({ received: true, processed, skipped, failed, ignored, outcomes });
}

/** GET handshake: echo the webhook key (200) so Xero activates the webhook. */
export async function handleXeroHandshake(req: Request, deps: XeroWebhookDeps): Promise<Response> {
  const webhookKey = deps.getWebhookKey();
  if (!webhookKey) {
    console.error("[monitor] Xero handshake: webhook key not configured — failing closed");
    return Response.json({ error: "Webhook key not configured" }, { status: 503 });
  }
  const headerValue = req.headers.get(XERO_WEBHOOK_HEADER);
  if (!headerValue || !constantTimeEqual(headerValue, webhookKey)) {
    return Response.json({ error: "Invalid Xero-Webhook-Key header" }, { status: 401 });
  }
  return new Response(webhookKey, {
    status: 200,
    headers: { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" },
  });
}

// ── Live-receipt log (evidence for the batch verification CLI) ───────────────

export const XERO_RECEIPTS_FILE = "monitoring_receipts.json";
const MAX_RECEIPTS = 200;

export function xeroReceiptsPath(dataDir: string): string {
  return join(dataDir, XERO_RECEIPTS_FILE);
}

/** Append a live-receipt record (bounded). Never stores credentials. */
export async function recordXeroWebhookReceipt(receipt: XeroWebhookReceipt, dataDir: string): Promise<void> {
  const file = xeroReceiptsPath(dataDir);
  const receipts: XeroWebhookReceipt[] = Array.isArray(readJSON(file)) ? readJSON(file) : [];
  receipts.push(receipt);
  writeJSON(file, receipts.slice(-MAX_RECEIPTS));
}

export function readXeroWebhookReceipts(dataDir: string): XeroWebhookReceipt[] {
  const value = readJSON(xeroReceiptsPath(dataDir));
  return Array.isArray(value) ? (value as XeroWebhookReceipt[]) : [];
}

/** Newest processed receipt for a capability within `withinMs`, if any. */
export function latestXeroWebhookReceipt(capabilityId: string, dataDir: string, withinMs: number): XeroWebhookReceipt | undefined {
  const cutoff = Date.now() - withinMs;
  const matches = readXeroWebhookReceipts(dataDir)
    .filter((r) => r.capabilityId === capabilityId && r.outcome === "processed")
    .filter((r) => new Date(r.receivedAt).getTime() >= cutoff);
  matches.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  return matches[0];
}

// ── Boot-time org gate registration ──────────────────────────────────────────

export interface RegisterOrgGatesOptions {
  dataDir: string;
  canMonitor: (email: string) => boolean;
  configureTenant: (orgId: string, gate: { purchased: boolean; status: string }) => void;
}

/**
 * Resolve the org UUID for a Xero access token via the canonical Connections
 * API. Bounded to the canonical host — never a guessed URL.
 */
export async function resolveXeroOrgId(accessToken: string | undefined): Promise<string> {
  if (!accessToken) throw new Error("Xero credential has no access token");
  const response = await fetch(XERO_CONNECTIONS_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Xero connections failed HTTP ${response.status}`);
  const connections = (await response.json()) as Array<{ tenantId?: string }>;
  if (!Array.isArray(connections) || connections.length === 0) throw new Error("Xero connections returned no tenant");
  const orgId = connections[0]?.tenantId;
  if (!orgId) throw new Error("Xero connections returned no tenantId");
  return orgId;
}

/**
 * Register a monitoring gate for every Xero org owned by an entitled tenant, so
 * real webhook events can dispatch. Reads per-tenant `${email}:xero` credential
 * records; resolves + persists missing org ids via the Connections API
 * (best-effort, fail-soft — expired tokens simply skip).
 */
export async function registerXeroOrgGates(opts: RegisterOrgGatesOptions): Promise<number> {
  const file = join(opts.dataDir, "tenant_oauth_credentials.json");
  const creds = readJSON(file);
  if (!creds || typeof creds !== "object") return 0;
  let registered = 0;
  for (const [key, raw] of Object.entries(creds)) {
    if (!key.endsWith(":xero") || !raw || typeof raw !== "object") continue;
    const email = key.slice(0, -":xero".length);
    if (!opts.canMonitor(email)) continue; // only entitled tenants get org gates
    const record = raw as Record<string, unknown>;
    let orgId = typeof record.tenantId === "string" ? record.tenantId : undefined;
    if (!orgId) {
      try {
        orgId = await resolveXeroOrgId(typeof record.accessToken === "string" ? record.accessToken : undefined);
        record.tenantId = orgId;
        const all = readJSON(file);
        if (all && typeof all === "object") {
          all[key] = record;
          writeJSON(file, all);
        }
      } catch (error) {
        console.log("[monitor] Xero org-gate registration skipped for " + email + ": " + (error instanceof Error ? error.message : error));
        continue;
      }
    }
    opts.configureTenant(orgId, { purchased: true, status: "Active" });
    registered++;
  }
  if (registered > 0) console.log(`[monitor] Registered ${registered} Xero org gate(s) for webhook monitoring`);
  return registered;
}
