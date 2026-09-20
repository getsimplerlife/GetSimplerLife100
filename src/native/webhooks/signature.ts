/**
 * native/webhooks/signature.ts — HMAC signing/verification primitives for the
 * native webhook layer (Phase 1.1).
 *
 * Scheme (same shape as the QBO receiver, generalised):
 *   X-Native-Signature: sha256=<hex lowercased HMAC-SHA256(rawBody, secret)>
 * Verification is CONSTANT-TIME (no early exit); secrets are never echoed.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

/** Constant-time string equality (length-safe, no early exit). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** hex(SHA-256(rawBody)) — durable evidence hash of the exact received bytes. */
export function nativeRawPayloadHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

/** sha256=<hex HMAC-SHA256(rawBody, secret)> — the canonical signature string. */
export function computeNativeSignature(rawBody: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(rawBody).digest("hex");
  return `sha256=${mac}`;
}

/** Verify a signature header value against the computed value. Constant-time. */
export function verifyNativeSignature(rawBody: string, headerValue: string | null, secret: string): boolean {
  if (!headerValue || !secret) return false;
  return constantTimeEqual(headerValue, computeNativeSignature(rawBody, secret));
}

/** Cryptographically random URL-safe secret (32 bytes → 43 chars). */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Cryptographically random event/delivery id. */
export function generateEntityId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

/** Stable idempotency key for an event: explicit key or the payload's eventId. */
export function resolveIdempotencyKey(headerKey: string | null, payload: Record<string, unknown>): string {
  if (headerKey && headerKey.trim().length > 0) return headerKey.trim();
  const payloadEventId = payload.eventId;
  if (typeof payloadEventId === "string" && payloadEventId.trim().length > 0) return payloadEventId.trim();
  return "";
}