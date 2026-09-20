/**
 * native/webhooks/index.ts — Phase 1.1 native capability: generic webhook
 * sink + outbound webhooks. Barrel + server wiring helpers.
 *
 * Wiring (prod-server.ts):
 *   SINK RECEIVE  POST /api/native/webhooks/:sinkId
 *                 → handleNativeWebhook(req, sinkId, { dataDir, onEvent: relay })
 *   AUTHED API    /api/native/webhook-sinks, /webhook-subscriptions, /events,
 *                 /flush, /webhook-events, /webhook-audit
 *                 → handleNativeAuthed(req, { userEmail, dataDir, resolver })
 *
 * The built-in "relay" handler is the Phase 1.1 workflow trigger: a sink
 * with outboundRelayEnabled fans each accepted event to the tenant's outbound
 * subscriptions (typed event → durable delivery). Both directions inherit the
 * platform guarantees: per-tenant isolation, fail-closed gates, encrypted
 * secrets at rest, immutable audit on every mutation, no silent data loss.
 */
import { handleNativeWebhook, type NativeSinkDeps } from "./sink";
import { handleNativeAuthed, type NativeAuthedCtx } from "./routes";
import { registerNativeEventType } from "./registry";
import { flushTenantDeliveries, publishWebhookEvent, validateWebhookUrl, sweepDueDeliveries, sanitizeRetry } from "./outbound";

export { handleNativeWebhook, handleNativeAuthed, flushTenantDeliveries, publishWebhookEvent, validateWebhookUrl, sweepDueDeliveries, sanitizeRetry };
export { registerNativeEventType };
export type { NativeSinkDeps, NativeAuthedCtx };

/**
 * Register the built-in Phase 1.1 event types. `native.ping` is the canonical
 * smoke/demo type (echo-validated); `native.*` future types register here too.
 * Runs at server boot (idempotent).
 */
export function registerBuiltinNativeEventTypes(): void {
  registerNativeEventType("native.ping", {
    validate: (payload) => {
      const p = payload as Record<string, unknown>;
      if (!p || typeof p !== "object" || typeof (p as any).message !== "string") {
        return { ok: false, reason: "native.ping payload must carry a string message" };
      }
      return { ok: true };
    },
    handler: (event) => {
      const message = (event.payload as Record<string, unknown>).message as string;
      console.log(`[native] ping from sink ${event.sinkId}: ${message}`);
    },
  });
}