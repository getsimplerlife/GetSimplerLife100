/**
 * native/webhooks/sink.ts — the generic inbound webhook sink
 * (Phase 1.1). POST /api/native/webhooks/:sinkId.
 *
 * Generalises the QBO receiver pattern:
 *   signature verify (constant-time) → idempotency check → parse → validate
 *   against the event registry → durable per-tenant receipt → registry
 *   dispatch (built-in: relay to outbound subscriptions).
 *
 * Fail-closed gates (owner standard):
 *   - non-POST → 405 (never the SPA fallback on a webhook path).
 *   - unknown / disabled sink → 404 (no existence leak beyond the id).
 *   - sink secret missing / signature missing or invalid → 401, nothing stored.
 *   - unparseable body → 400. KNOWN type with invalid shape → 400.
 *   - duplicate idempotency key with the SAME payload → 200 {duplicate:true}
 *     (idempotent replay returns the original event id); same key with a
 *     DIFFERENT payload → 409 (never silently overwrite).
 *   - unknown event type → 200 ACK, NOT recorded (QBO precedent).
 *   - never mutates tenant data; receipts are append-only evidence.
 */
import {
  NATIVE_SIGNATURE_HEADER,
  NATIVE_IDEMPOTENCY_HEADER,
  type NativeWebhookEvent,
  type NativeWebhookReceipt,
} from "./types";
import { constantTimeEqual, nativeRawPayloadHash, computeNativeSignature, generateEntityId, resolveIdempotencyKey } from "./signature";
import {
  getSink,
  decryptSecret,
  appendReceipt,
  markSeen,
  seenValue,
} from "./store";
import { validateNativeEventType, dispatchNativeEvent } from "./registry";

export interface NativeSinkDeps {
  dataDir: string;
  /** Called AFTER the durable receipt is written, on success dispatch. */
  onEvent?: (event: NativeWebhookEvent) => Promise<void> | void;
}

/** True when the idempotency key was already seen with an identical payload. */
function isIdenticalReplay(dedupe: { eventId: string; hash: string } | null, payloadHash: string): boolean {
  return !!dedupe && dedupe.hash === payloadHash && dedupe.eventId.length > 0;
}

/**
 * Full native sink route handler (webhook receiver).
 * Returns a Response; on success the durable receipt already exists.
 */
export async function handleNativeWebhook(req: Request, sinkId: string, deps: NativeSinkDeps): Promise<Response> {
  if (req.method.toUpperCase() !== "POST") {
    return Response.json({ error: "Method not allowed — POST required" }, { status: 405 });
  }
  const sink = getSink(deps.dataDir, sinkId);
  if (!sink || !sink.enabled) {
    return Response.json({ error: "Unknown webhook sink" }, { status: 404 });
  }
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return Response.json({ error: "Failed to read body" }, { status: 400 });
  }
  const signature = req.headers.get(NATIVE_SIGNATURE_HEADER);
  if (!signature) {
    return Response.json({ error: "Missing x-native-signature header" }, { status: 401 });
  }
  let secret: string;
  try {
    secret = decryptSecret(sink.secretEncrypted);
  } catch {
    return Response.json({ error: "Sink secret unavailable" }, { status: 401 });
  }
  const valid = constantTimeEqual(signature, computeNativeSignature(rawBody, secret));
  if (!valid) {
    return Response.json({ error: "Invalid x-native-signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return Response.json({ error: "Payload must be a JSON object" }, { status: 400 });
  }
  const payload = parsed as Record<string, unknown>;
  const eventType = typeof payload.eventType === "string" ? payload.eventType : "";
  if (!eventType) {
    return Response.json({ error: "Payload must carry a string eventType" }, { status: 400 });
  }
  // Sink allow-list: [] = accept any REGISTERED type; else the type must be listed.
  if (sink.eventTypes.length > 0 && !sink.eventTypes.includes(eventType)) {
    return Response.json({ received: true, acknowledged: 0, ignored: [`${eventType}:not-in-sink-list`] });
  }
  const validation = validateNativeEventType(eventType, payload);
  if (!validation.ok) {
    return Response.json({ error: validation.reason }, { status: 400 });
  }
  if (!validation.known) {
    // Unknown to the registry: ACK without recording (never invent meaning).
    return Response.json({ received: true, acknowledged: 0, ignored: [`${eventType}:unknown-type`] });
  }

  const idempotencyKey = resolveIdempotencyKey(req.headers.get(NATIVE_IDEMPOTENCY_HEADER), payload);
  if (!idempotencyKey) {
    return Response.json({ error: "Missing idempotency key (x-idempotency-key header or payload.eventId)" }, { status: 400 });
  }
  const rawPayloadHash = nativeRawPayloadHash(rawBody);
  const dedupe = seenValue(deps.dataDir, sink.tenantId, idempotencyKey);
  if (dedupe) {
    if (isIdenticalReplay(dedupe, rawPayloadHash)) {
      return Response.json({ received: true, duplicate: true, eventId: dedupe.eventId });
    }
    return Response.json(
      { error: "Idempotency key was already used with a different payload" },
      { status: 409 },
    );
  }

  const eventId = generateEntityId("evt");
  const occurredAt = typeof payload.occurredAt === "string" && payload.occurredAt ? payload.occurredAt : new Date().toISOString();
  const event: NativeWebhookEvent = {
    id: eventId,
    tenantId: sink.tenantId,
    sinkId: sink.sinkId,
    eventType,
    payload,
    occurredAt,
    idempotencyKey,
    rawPayloadHash,
  };
  const receipt: NativeWebhookReceipt = {
    id: generateEntityId("rcp"),
    eventId,
    tenantId: sink.tenantId,
    sinkId: sink.sinkId,
    eventType,
    rawPayloadHash,
    idempotencyKey,
    outcome: "received",
    receivedAt: new Date().toISOString(),
  };
  // Durable receipt FIRST (the sink's evidence), then idempotency marker, then
  // dispatch. If the receipt write fails we fail closed (nothing reported ok).
  appendReceipt(deps.dataDir, sink.tenantId, receipt);
  markSeen(deps.dataDir, sink.tenantId, idempotencyKey, { eventId, hash: rawPayloadHash, ts: Date.now() });

  // Relay fan-out to outbound subscriptions (only when the sink opts in).
  // Receipts stay "received"; relay outcomes are captured by the durable
  // delivery records + audit trail — receipts are evidence, not state.
  let relay: "off" | "relayed" | "relay-failed" = "off";
  if (sink.outboundRelayEnabled && deps.onEvent) {
    relay = "relayed";
    try {
      await deps.onEvent(event);
    } catch {
      relay = "relay-failed";
    }
  }
  // Registry handler fires regardless of relay (its own responsibility).
  const dispatchResult = await dispatchNativeEvent(event);

  return Response.json({
    received: true,
    acknowledged: 1,
    eventId,
    eventType,
    relay,
    handler: dispatchResult,
  });
}