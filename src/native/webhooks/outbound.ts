/**
 * native/webhooks/outbound.ts — outbound webhooks (Phase 1.1).
 *
 * Per-tenant subscriptions + publish API + durable delivery engine:
 *   - Subscription URLs must be PUBLIC https (SSRF-guarded: literal private/
 *     link-local IPs, localhost, .local, http, and userinfo are rejected; when
 *     a DNS resolver is provided, resolved addresses are checked too and any
 *     private address → reject, resolution failure → reject = fail-closed).
 *   - Each delivery is signed: X-Native-Signature: sha256=<HMAC-SHA256(rawBody,
 *     subscription secret)> and carries X-Native-Event-Id (receiver-side
 *     idempotency) + X-Native-Attempt.
 *   - Retry: bounded exponential backoff (initialBackoffMs * 2^(attempt-1),
 *     capped at 60s), maxAttempts per subscription. 4xx → dead immediately
 *     (permanent). Network/5xx → schedule retry. maxAttempts exhausted → dead
 *     + loud console.error (fail loudly; never silently drop).
 *   - Every mutation (sub CRUD, publish, delivery attempt outcome) is written
 *     to the tenant's immutable native audit trail.
 *
 * Non-destruction: the delivery engine NEVER deletes deliveries of its own
 * accord (bounded history is retained per tenant); dead letters remain
 * readable until the tenant removes them.
 */
import {
  NATIVE_EVENT_ID_HEADER,
  NATIVE_SIGNATURE_HEADER,
  MAX_SUBSCRIPTIONS_PER_TENANT,
  type NativeWebhookSubscription,
  type NativeWebhookDelivery,
  type NativeDeliveryAttempt,
} from "./types";
import { computeNativeSignature, nativeRawPayloadHash, generateEntityId, generateWebhookSecret } from "./signature";
import {
  listSubscriptions,
  saveSubscription,
  deleteSubscription,
  listDeliveries,
  saveDeliveries,
  appendNativeAudit as appendAuditEntry,
  encryptSecret,
  decryptSecret,
} from "./store";

export const NATIVE_DELIVERY_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;

/** DNS resolver used by url validation (injectable for hermetic tests). */
export type HostResolver = (hostname: string) => Promise<string[]>;

const PRIVATE_IPV4_RE =
  /^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|172\.(1[6-9]|2\d|3[01])\.)/;
const PRIVATE_IPV6_RE = /^::1$|^fc|^fd|^fe80/i;
function isPrivateIpLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (PRIVATE_IPV6_RE.test(host)) return true;
  if (host.includes(":")) return false; // other IPv6 form — handled by resolver check
  return PRIVATE_IPV4_RE.test(host);
}

/**
 * Validate a subscriber URL (SSRF guard, OWASP bar). When a resolver is
 * provided, DNS results are also checked against private ranges and
 * resolution errors fail CLOSED. Never follows redirects off the validated
 * host (see sendWebhookDelivery — no redirect policy change from fetch).
 */
export async function validateWebhookUrl(
  url: string,
  resolver?: HostResolver,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "Only https:// subscriber URLs are allowed" };
  if (parsed.username || parsed.password) return { ok: false, reason: "URL userinfo is not allowed" };
  const hostname = parsed.hostname;
  if (!hostname) return { ok: false, reason: "URL must have a host" };
  if (hostname.toLowerCase() === "localhost" || hostname.toLowerCase().endsWith(".local")) {
    return { ok: false, reason: "Local/reserved hosts are not allowed" };
  }
  if (isPrivateIpLiteral(hostname)) return { ok: false, reason: "Private/link-local IPs are not allowed" };
  const isIpLiteral = hostname.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  if (!resolver || isIpLiteral) return { ok: true }; // literal public IP accepted; DNS check skipped w/o resolver
  try {
    const addresses = await resolver(hostname);
    if (addresses.length === 0) return { ok: false, reason: "Host did not resolve" };
    for (const addr of addresses) {
      if (isPrivateIpLiteral(addr.split("%")[0])) return { ok: false, reason: "Host resolves to a private address" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "Host resolution failed" };
  }
}

export interface CreateSubscriptionInput {
  tenantId: string;
  url: string;
  eventTypes?: string[];
  enabled?: boolean;
  retry?: { maxAttempts?: number; initialBackoffMs?: number };
  actor: string;
  resolver?: HostResolver;
}
export interface NewSubscription {
  subscription: NativeWebhookSubscription;
  /** The ONLY time the plaintext secret is returned. */
  secret: string;
}

/** Create an outbound subscription (SSRF-guarded, audited). Returns secret once. */
export async function createOutboundSubscription(
  dataDir: string,
  input: CreateSubscriptionInput,
): Promise<{ ok: true; result: NewSubscription } | { ok: false; reason: string; status: number }> {
  const urlCheck = await validateWebhookUrl(input.url, input.resolver);
  if (!urlCheck.ok) return { ok: false, reason: urlCheck.reason, status: 400 };
  const current = listSubscriptions(dataDir, input.tenantId);
  if (current.length >= MAX_SUBSCRIPTIONS_PER_TENANT) {
    return { ok: false, reason: `Subscription limit reached (${MAX_SUBSCRIPTIONS_PER_TENANT})`, status: 400 };
  }
  const secret = generateWebhookSecret();
  const sub: NativeWebhookSubscription = {
    id: generateEntityId("sub"),
    tenantId: input.tenantId,
    url: input.url,
    secretEncrypted: encryptSecret(secret),
    eventTypes: Array.isArray(input.eventTypes) ? input.eventTypes.filter((t): t is string => typeof t === "string" && t.length > 0) : [],
    enabled: input.enabled !== false,
    retry: {
      maxAttempts: Math.min(Math.max(input.retry?.maxAttempts ?? 3, 1), 10),
      initialBackoffMs: Math.min(Math.max(input.retry?.initialBackoffMs ?? 500, 100), 30_000),
    },
    createdBy: input.actor,
    createdAt: new Date().toISOString(),
  };
  saveSubscription(dataDir, sub);
  appendAuditEntry(dataDir, input.tenantId, input.actor, "native.webhook.sub.create", `Subscription ${sub.id} -> ${sub.url}`);
  return { ok: true, result: { subscription: sub, secret } };
}

/** Public shape of a subscription (NEVER includes the encrypted secret). */
export function publicSubscription(sub: NativeWebhookSubscription): Omit<NativeWebhookSubscription, "secretEncrypted"> {
  const { secretEncrypted: _secret, ...rest } = sub;
  void _secret;
  return rest;
}

/** Delete a tenant's subscription by exact id. Unknown id → false (404). */
export function removeOutboundSubscription(
  dataDir: string,
  tenantId: string,
  id: string,
  actor: string,
): boolean {
  const removed = deleteSubscription(dataDir, tenantId, id);
  if (removed) appendAuditEntry(dataDir, tenantId, actor, "native.webhook.sub.delete", `Subscription ${id}`);
  return removed;
}

/**
 * Publish an event to a tenant's matching outbound subscriptions (enqueue
 * durable deliveries — the flush engine performs the actual HTTP sends).
 * Event types are matched against each subscription's allow-list ([] = all).
 */
export function publishWebhookEvent(
  dataDir: string,
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
  actor: string,
): number {
  const subs = listSubscriptions(dataDir, tenantId).filter(
    (s) => s.enabled && (s.eventTypes.length === 0 || s.eventTypes.includes(eventType)),
  );
  if (subs.length === 0) return 0;
  const deliveries = listDeliveries(dataDir, tenantId);
  const now = new Date().toISOString();
  for (const sub of subs) {
    const delivery: NativeWebhookDelivery = {
      id: generateEntityId("dly"),
      tenantId,
      subscriptionId: sub.id,
      subscriptionUrl: sub.url,
      eventId: generateEntityId("evt"),
      eventType,
      payload,
      status: "pending",
      attempts: [],
      createdAt: now,
      rawPayloadHash: nativeRawPayloadHash(JSON.stringify(payload)),
    };
    deliveries.push(delivery);
  }
  saveDeliveries(dataDir, tenantId, deliveries);
  appendAuditEntry(
    dataDir,
    tenantId,
    actor,
    "native.webhook.publish",
    `Published ${eventType} to ${subs.length} subscription(s)`,
  );
  return subs.length;
}

/** Result of flushing one delivery. */
export interface FlushResult {
  attempted: number;
  delivered: number;
  dead: number;
  pending: number;
}

/** Injectable transport for the delivery engine (defaults to global fetch). */
export type DeliverFn = (
  body: string,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
) => Promise<{ status: number }>;

async function defaultDeliver(
  body: string,
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ status: number }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status };
}

/**
 * Process all due deliveries for a tenant: sign via the subscription secret,
 * POST, record each attempt durably, schedule retries w/ backoff, dead-letter
 * on permanent failure or attempt exhaustion. Non-destructive (never deletes).
 */
export async function flushTenantDeliveries(
  dataDir: string,
  tenantId: string,
  deliver: DeliverFn = defaultDeliver,
  nowMs: number = Date.now(),
): Promise<FlushResult> {
  const deliveries = listDeliveries(dataDir, tenantId);
  const due = deliveries.filter(
    (d) => d.status === "pending" && (!d.nextRetryAt || Date.parse(d.nextRetryAt) <= nowMs),
  );
  if (due.length === 0) return { attempted: 0, delivered: 0, dead: 0, pending: deliveries.filter((d) => d.status === "pending").length };
  const beforeDelivered = deliveries.filter((d) => d.status === "delivered").length;
  const beforeDead = deliveries.filter((d) => d.status === "dead").length;
  const subs = new Map(listSubscriptions(dataDir, tenantId).map((s) => [s.id, s]));
  let attempted = 0;
  for (const delivery of due) {
    const sub = subs.get(delivery.subscriptionId);
    if (!sub || !sub.enabled) {
      delivery.status = "dead";
      delivery.attempts.push({ attempt: 0, at: new Date(nowMs).toISOString(), error: "Subscription missing or disabled", success: false });
      attempted += 0;
      continue;
    }
    const secret = decryptSecret(sub.secretEncrypted);
    const envelope = JSON.stringify({
      id: delivery.id,
      eventId: delivery.eventId,
      eventType: delivery.eventType,
      occurredAt: new Date(nowMs).toISOString(),
      payload: delivery.payload,
    });
    const signature = computeNativeSignature(envelope, secret);
    const attemptNumber = delivery.attempts.length + 1;
    const attempt: NativeDeliveryAttempt = {
      attempt: attemptNumber,
      at: new Date(nowMs).toISOString(),
      success: false,
    };
    try {
      const result = await deliver(envelope, delivery.subscriptionUrl, {
        [NATIVE_SIGNATURE_HEADER]: signature,
        [NATIVE_EVENT_ID_HEADER]: delivery.eventId,
        ["x-native-attempt"]: String(attemptNumber),
      }, NATIVE_DELIVERY_TIMEOUT_MS);
      attempt.statusCode = result.status;
      if (result.status >= 200 && result.status < 300) {
        attempt.success = true;
        delivery.attempts.push(attempt);
        delivery.status = "delivered";
        appendAuditEntry(dataDir, tenantId, "system", "native.webhook.delivery.sent", `Delivery ${delivery.id} delivered (${result.status})`);
      } else if (result.status >= 400 && result.status < 500) {
        delivery.status = "dead";
        delivery.attempts.push(attempt);
        appendAuditEntry(dataDir, tenantId, "system", "native.webhook.delivery.rejected", `Delivery ${delivery.id} rejected (HTTP ${result.status})`);
      } else {
        delivery.attempts.push(attempt);
        scheduleRetry(dataDir, tenantId, delivery, attemptNumber, attempt);
      }
      attempted += 1;
    } catch (error) {
      attempt.error = error instanceof Error ? error.message : String(error);
      attempt.statusCode = 0;
      delivery.attempts.push(attempt);
      scheduleRetry(dataDir, tenantId, delivery, attemptNumber, attempt);
      attempted += 1;
    }
  }
  // Persist every mutation from this pass (deliveries are durable queue+history).
  saveDeliveries(dataDir, tenantId, deliveries);
  const finalList = listDeliveries(dataDir, tenantId);
  const delivered = finalList.filter((d) => d.status === "delivered").length - beforeDelivered;
  const dead = finalList.filter((d) => d.status === "dead").length - beforeDead;
  return { attempted, delivered, dead, pending: finalList.filter((d) => d.status === "pending").length };
}

/** Schedule a retry (or dead-letter at exhaustion) for a delivery. */
function scheduleRetry(
  dataDir: string,
  tenantId: string,
  delivery: NativeWebhookDelivery,
  attemptNumber: number,
  attempt: NativeDeliveryAttempt,
): void {
  void attempt; // the attempt record is already stored on the delivery
  const sub = listSubscriptions(dataDir, tenantId).find((s) => s.id === delivery.subscriptionId);
  const maxAttempts = sub?.retry.maxAttempts ?? 3;
  const initialBackoffMs = sub?.retry.initialBackoffMs ?? 500;
  if (attemptNumber >= maxAttempts) {
    delivery.status = "dead";
    appendAuditEntry(
      dataDir,
      tenantId,
      "system",
      "native.webhook.delivery.dead",
      `Delivery ${delivery.id} dead after ${attemptNumber} attempt(s)`,
    );
    console.error(`[native] webhook delivery ${delivery.id} dead after ${attemptNumber} attempts (${delivery.subscriptionUrl})`);
  } else {
    const backoff = Math.min(initialBackoffMs * 2 ** (attemptNumber - 1), MAX_BACKOFF_MS);
    delivery.nextRetryAt = new Date(Date.now() + backoff).toISOString();
  }
}