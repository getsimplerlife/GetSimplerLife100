/**
 * native/webhooks/types.ts — Phase 1.1 native capability: generic webhook
 * sink + outbound webhooks.
 *
 * Model (mirrors the QBO/Xero receiver pattern generalised, per the Phase-1
 * owner directive):
 *   inbound  → POST /api/native/webhooks/:sinkId — HMAC-signed, idempotency-
 *              keyed, validated against the event registry, recorded as a
 *              durable per-tenant receipt, then dispatched to registered
 *              handlers (Phase 1.1 built-in: relay to the tenant's outbound
 *              subscriptions). Fail-closed on every gate.
 *   outbound → per-tenant subscriptions (https-only, SSRF-guarded URLs) +
 *              publish API; the delivery engine signs each envelope, retries
 *              with bounded exponential backoff, and dead-letters durably.
 *
 * Isolation: every tenant-scoped store is keyed by tenantId (mirroring
 * vault-audit/vault-folder). Sink secrets and outbound secrets are stored
 * ENCRYPTED at rest (integrations/framework/connection encrypt/decrypt) and
 * are never returned after creation. Every sink/subscription/delivery
 * mutation is written to the tenant's immutable native-webhook audit trail.
 *
 * Safety: signature compare is constant-time; unknown/disabled sink → 404
 * (no existence leak beyond an id you must already know); bad signature →
 * 401, nothing recorded; malformed payload for a KNOWN type → 400; unknown
 * event types are acknowledged but never recorded (QBO precedent).
 */

/** Inbound sink: who may POST to /api/native/webhooks/:sinkId and how. */
export interface NativeWebhookSink {
  sinkId: string;
  tenantId: string;
  /** Encrypted at rest — see store.ts. Never returned except at create. */
  secretEncrypted: string;
  /** Allow-list of event types this sink accepts. [] = accept any registered type. */
  eventTypes: string[];
  /** When false (default), recorded events are NOT relayed to outbound subscriptions. */
  outboundRelayEnabled: boolean;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

/** Outbound subscription: where a tenant's events get delivered. */
export interface NativeWebhookSubscription {
  id: string;
  tenantId: string;
  url: string;
  /** Encrypted at rest. Never returned except at create. */
  secretEncrypted: string;
  /** Allow-list of event types to deliver. [] = deliver all. */
  eventTypes: string[];
  enabled: boolean;
  /** Bounded retry policy. maxAttempts>=1, initialBackoffMs>=100. */
  retry: { maxAttempts: number; initialBackoffMs: number };
  createdBy: string;
  createdAt: string;
}

/** One accepted inbound event, after validation + before dispatch. */
export interface NativeWebhookEvent {
  id: string;
  tenantId: string;
  sinkId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  idempotencyKey: string;
  rawPayloadHash: string;
}

/** Durable per-tenant receipt (the sink's evidence record). */
export interface NativeWebhookReceipt {
  id: string;
  eventId: string;
  tenantId: string;
  sinkId: string;
  eventType: string;
  rawPayloadHash: string;
  idempotencyKey: string;
  outcome: "received" | "relayed" | "relay-failed";
  receivedAt: string;
}

/** One delivery attempt of an outbound event to one subscription. */
export interface NativeDeliveryAttempt {
  attempt: number;
  at: string;
  statusCode?: number;
  error?: string;
  success: boolean;
}

/** Durable outbound delivery record (queue + history per tenant). */
export interface NativeWebhookDelivery {
  id: string;
  tenantId: string;
  subscriptionId: string;
  subscriptionUrl: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivered" | "dead";
  attempts: NativeDeliveryAttempt[];
  nextRetryAt?: string;
  createdAt: string;
  /** Only populated on success — never logs the subscriber secret. */
  rawPayloadHash: string;
}

/** Immutable native-layer audit entry (mirrors VaultAuditEntry shape). */
export interface NativeAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  action: string;
  detail: string;
  actor: string;
}

/**
 * Event-registry entry. `validate` parses/validates the payload for a KNOWN
 * type (returning a 400-friendly reason on failure); `handler` runs after the
 * durable receipt is written (Phase 1.1: relay fan-out / workflow trigger).
 */
export interface NativeEventTypeEntry {
  validate?: (payload: unknown) => { ok: true } | { ok: false; reason: string };
  handler?: (event: NativeWebhookEvent) => Promise<void> | void;
}

/** Static helpers the sink/outbound modules share. */
export const NATIVE_SIGNATURE_HEADER = "x-native-signature";
export const NATIVE_EVENT_ID_HEADER = "x-native-event-id";
export const NATIVE_IDEMPOTENCY_HEADER = "x-idempotency-key";
export const NATIVE_SINKS_KEY = "native_webhook_sinks.json";
export const NATIVE_RECEIPTS_KEY = "native_webhook_receipts.json";
export const NATIVE_SEEN_KEY = "native_webhook_seen.json";
export const NATIVE_SUBSCRIPTIONS_KEY = "native_webhook_subscriptions.json";
export const NATIVE_DELIVERIES_KEY = "native_webhook_deliveries.json";
export const NATIVE_AUDIT_KEY = "native_webhook_audit.json";
export const MAX_RECEIPTS_PER_TENANT = 500;
export const MAX_DELIVERIES_PER_TENANT = 1000;
export const MAX_SEEN_PER_TENANT = 1000;
export const MAX_SUBSCRIPTIONS_PER_TENANT = 25;
export const MAX_SINKS_PER_TENANT = 10;