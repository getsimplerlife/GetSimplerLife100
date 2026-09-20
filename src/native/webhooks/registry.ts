/**
 * native/webhooks/registry.ts — typed event registry for the native webhook
 * sink (Phase 1.1).
 *
 * Event types are declared BEFORE use (exact-string keys, namespaced like
 * "invoice.created.v1"). A KNOWN type gets its payload validated (400 on
 * failure) and, after the durable receipt is written, dispatched to its
 * registered handler (Phase 1.1 built-in: relay to outbound subscriptions).
 * An UNKNOWN type is acknowledged but NEVER recorded (QBO precedent: never
 * fabricate meaning for payloads we do not understand).
 */
import type { NativeEventTypeEntry, NativeWebhookEvent } from "./types";

const registry = new Map<string, NativeEventTypeEntry>();

/** Register (or replace) the handler/validator for an exact event type. */
export function registerNativeEventType(eventType: string, entry: NativeEventTypeEntry): void {
  if (!eventType || eventType.length === 0) throw new Error("Event type must be a non-empty string");
  registry.set(eventType, entry);
}

export function isRegisteredEventType(eventType: string): boolean {
  return registry.has(eventType);
}

/** Test-only: reset the registry (prod wiring re-registers built-ins). */
export function clearNativeEventRegistry(): void {
  registry.clear();
}

/**
 * Validate a payload for a KNOWN type. Unknown type → { ok: true, known:false }
 * (caller ACKs without recording). Known type without validator → ok.
 */
export function validateNativeEventType(
  eventType: string,
  payload: unknown,
): { ok: true; known: boolean } | { ok: false; known: true; reason: string } {
  const entry = registry.get(eventType);
  if (!entry) return { ok: true, known: false };
  if (!entry.validate) return { ok: true, known: true };
  const result = entry.validate(payload);
  if (result.ok) return { ok: true, known: true };
  return { ok: false, known: true, reason: result.reason };
}

/** Run the registered handler for a recorded event (best-effort, never throws). */
export async function dispatchNativeEvent(event: NativeWebhookEvent): Promise<string> {
  const entry = registry.get(event.eventType);
  if (!entry?.handler) return "no-handler";
  try {
    await entry.handler(event);
    return "handled";
  } catch (error) {
    console.error(
      `[native] webhook handler failed for ${event.eventType}:`,
      error instanceof Error ? error.message : String(error),
    );
    return "handler-error";
  }
}