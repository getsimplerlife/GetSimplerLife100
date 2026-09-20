/**
 * native/webhooks/routes.ts — authenticated tenant-facing API for the native
 * webhook layer (Phase 1.1):
 *   GET    /api/native/webhook-sinks            list my sinks (no secrets)
 *   POST   /api/native/webhook-sinks            create a sink (secret returned ONCE)
 *   DELETE /api/native/webhook-sinks?id=        delete one of my sinks
 *   GET    /api/native/webhook-subscriptions    list my subscriptions (no secrets)
 *   POST   /api/native/webhook-subscriptions    create (SSRF-guarded; secret ONCE)
 *   DELETE /api/native/webhook-subscriptions?id=  delete one of mine
 *   POST   /api/native/events                   publish an event to my subscriptions
 *   POST   /api/native/flush                    deliver my due webhooks now (best-effort)
 *   GET    /api/native/webhook-events           my receipts + delivery history (read-only)
 *
 * Every route is tenant-scoped by the session identity; there is no
 * cross-tenant read/write path. Methods/ids are validated fail-closed.
 */
import { MAX_SINKS_PER_TENANT, type NativeWebhookSink } from "./types";
import { generateWebhookSecret, generateEntityId } from "./signature";
import {
  listSinksForTenant,
  getSink,
  saveSink,
  deleteSink,
  encryptSecret,
  listReceipts,
  listDeliveries,
  listNativeAudit,
  appendNativeAudit,
  listSubscriptions,
} from "./store";
import {
  createOutboundSubscription,
  removeOutboundSubscription,
  publishWebhookEvent,
  flushTenantDeliveries,
  publicSubscription,
  sanitizeRetry,
} from "./outbound";
import type { HostResolver } from "./outbound";

export interface NativeAuthedCtx {
  userEmail: string;
  dataDir: string;
  /** Optional DNS resolver for subscriber-URL SSRF checks (prod: node dns). */
  resolver?: HostResolver;
  /** When true, publish also triggers a best-effort delivery flush (prod: true). */
  autoFlush?: boolean;
}

function maskSecrets(sinks: NativeWebhookSink[]) {
  return sinks.map((s) => ({
    sinkId: s.sinkId,
    tenantId: s.tenantId,
    eventTypes: s.eventTypes,
    outboundRelayEnabled: s.outboundRelayEnabled,
    enabled: s.enabled,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
  }));
}

/** Dispatch an authenticated /api/native/* request. Returns the Response. */
export async function handleNativeAuthed(req: Request, ctx: NativeAuthedCtx): Promise<Response> {
  const { pathname } = new URL(req.url);
  const tenantId = ctx.userEmail;
  const P = (name: string) => new URL(req.url).searchParams.get(name);

  // ---- Sinks -------------------------------------------------------------
  if (pathname === "/api/native/webhook-sinks" && req.method === "GET") {
    return Response.json({ data: maskSecrets(listSinksForTenant(ctx.dataDir, tenantId)) });
  }
  if (pathname === "/api/native/webhook-sinks" && req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const existing = listSinksForTenant(ctx.dataDir, tenantId);
    if (existing.length >= MAX_SINKS_PER_TENANT) {
      return Response.json({ error: `Sink limit reached (${MAX_SINKS_PER_TENANT})` }, { status: 400 });
    }
    const sinkId = generateEntityId("whs");
    const secret = generateWebhookSecret();
    const eventTypes = Array.isArray(body.eventTypes)
      ? body.eventTypes.filter((t): t is string => typeof t === "string" && t.length > 0)
      : [];
    const sink: NativeWebhookSink = {
      sinkId,
      tenantId,
      secretEncrypted: encryptSecret(secret),
      eventTypes,
      outboundRelayEnabled: body.outboundRelayEnabled === true,
      enabled: body.enabled !== false,
      createdBy: tenantId,
      createdAt: new Date().toISOString(),
    };
    saveSink(ctx.dataDir, sink);
    appendNativeAudit(ctx.dataDir, tenantId, tenantId, "native.webhook.sink.create", `Sink ${sinkId}`);
    return Response.json({ data: { sinkId, secret, eventTypes: sink.eventTypes, outboundRelayEnabled: sink.outboundRelayEnabled } });
  }
  if (pathname === "/api/native/webhook-sinks" && req.method === "DELETE") {
    const id = P("id") || "";
    const sink = getSink(ctx.dataDir, id);
    if (!sink || sink.tenantId !== tenantId) {
      return Response.json({ error: "Sink not found" }, { status: 404 });
    }
    deleteSink(ctx.dataDir, id);
    appendNativeAudit(ctx.dataDir, tenantId, tenantId, "native.webhook.sink.delete", `Sink ${id}`);
    return Response.json({ ok: true });
  }

  // ---- Subscriptions -------------------------------------------------------
  if (pathname === "/api/native/webhook-subscriptions" && req.method === "GET") {
    return Response.json({ data: listSubscriptions(ctx.dataDir, tenantId).map(publicSubscription) });
  }
  if (pathname === "/api/native/webhook-subscriptions" && req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const url = typeof body.url === "string" ? body.url : "";
    if (!url) return Response.json({ error: "url is required" }, { status: 400 });
    const created = await createOutboundSubscription(ctx.dataDir, {
      tenantId,
      url,
      eventTypes: Array.isArray(body.eventTypes) ? body.eventTypes.map(String) : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      retry: body.retry && typeof body.retry === "object" ? sanitizeRetry({ maxAttempts: (body.retry as any).maxAttempts, initialBackoffMs: (body.retry as any).initialBackoffMs }) : undefined,
      actor: tenantId,
      resolver: ctx.resolver,
    });
    if (!created.ok) return Response.json({ error: created.reason }, { status: created.status });
    return Response.json({ data: { subscription: publicSubscription(created.result.subscription), secret: created.result.secret } });
  }
  if (pathname === "/api/native/webhook-subscriptions" && req.method === "DELETE") {
    const id = P("id") || "";
    const removed = removeOutboundSubscription(ctx.dataDir, tenantId, id, tenantId);
    if (!removed) return Response.json({ error: "Subscription not found" }, { status: 404 });
    return Response.json({ ok: true });
  }

  // ---- Publish + flush ------------------------------------------------------
  if (pathname === "/api/native/events" && req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const eventType = typeof body.eventType === "string" ? body.eventType : "";
    if (!eventType) return Response.json({ error: "eventType is required" }, { status: 400 });
    const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};
    const count = publishWebhookEvent(ctx.dataDir, tenantId, eventType, payload, tenantId);
    // Fire the delivery engine for this tenant now (best-effort, non-blocking
    // afterwards): Phase 1.1 also offers an explicit flush endpoint.
    if (ctx.autoFlush) void flushTenantDeliveries(ctx.dataDir, tenantId).catch(() => undefined);
    return Response.json({ ok: true, queued: count });
  }
  if (pathname === "/api/native/flush" && req.method === "POST") {
    const result = await flushTenantDeliveries(ctx.dataDir, tenantId);
    return Response.json({ ok: true, ...result });
  }

  // ---- Read-only history -----------------------------------------------------
  if (pathname === "/api/native/webhook-events" && req.method === "GET") {
    return Response.json({
      data: {
        receipts: listReceipts(ctx.dataDir, tenantId),
        deliveries: listDeliveries(ctx.dataDir, tenantId).map((d) => ({
          id: d.id,
          subscriptionId: d.subscriptionId,
          subscriptionUrl: d.subscriptionUrl,
          eventId: d.eventId,
          eventType: d.eventType,
          status: d.status,
          attempts: d.attempts,
          createdAt: d.createdAt,
          nextRetryAt: d.nextRetryAt,
          rawPayloadHash: d.rawPayloadHash,
        })),
      },
    });
  }
  if (pathname === "/api/native/webhook-audit" && req.method === "GET") {
    return Response.json({ data: listNativeAudit(ctx.dataDir, tenantId) });
  }
  return Response.json({ error: "Unknown native webhook endpoint" }, { status: 404 });
}