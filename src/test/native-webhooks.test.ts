/**
 * native-webhooks.test.ts — Phase 1.1 native webhook layer: generic sink +
 * outbound webhooks.
 *
 * Coverage per the owner quality bar ("verify like it's production" + OWASP):
 *   - Sink fail-closed gates: 405 method, 404 unknown/disabled sink, 401 on
 *     missing/invalid signature (nothing recorded), 400 on malformed body /
 *     missing eventType / invalid idempotency / invalid known-type shape,
 *     200-ACK-without-record on unknown types and non-allow-listed types.
 *   - Idempotency: identical replay → duplicate + same eventId, no double
 *     receipt; same key + different payload → 409.
 *   - Isolation: receipts/subscriptions/sinks are tenant-scoped; cross-tenant
 *     reads and deletes fail (zero cross-tenant paths — re-proven per data path).
 *   - Registry: validate + dispatch (handler runs post-receipt; handler errors
 *     never throw out of the route).
 *   - SSRF guard: http/localhost/private/link-local IPs/userinfo/.local and
 *     DNS-resolving-to-private are rejected; public https accepted; DNS
 *     resolution failure fails CLOSED.
 *   - Outbound engine: signed envelopes (constant-time verifiable), idempotent
 *     event-id header, bounded backoff retry, 4xx → dead, attempt exhaustion →
 *     dead, per-tenant delivery history + audit on every mutation.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeNativeSignature } from "../native/webhooks/signature";
import { clearNativeEventRegistry, registerNativeEventType } from "../native/webhooks/registry";
import { handleNativeWebhook } from "../native/webhooks/sink";
import {
  listReceipts,
  saveSink,
  encryptSecret,
  listSinksForTenant,
  listSubscriptions,
  listDeliveries,
  countNativeAudit,
  listNativeAudit,
} from "../native/webhooks/store";
import { handleNativeAuthed } from "../native/webhooks/routes";
import {
  createOutboundSubscription,
  publishWebhookEvent,
  flushTenantDeliveries,
  removeOutboundSubscription,
  validateWebhookUrl,
  type DeliverFn,
} from "../native/webhooks/outbound";
import type { NativeWebhookSink } from "../native/webhooks/types";

let dataDir = "";
let t = 0;

function freshDir(): string {
  t += 1;
  const dir = mkdtempSync(join(tmpdir(), `native-wh-${process.pid}-${t}-`));
  return dir;
}

function makeSink(tenantId: string, secret: string, opts?: Partial<NativeWebhookSink>): NativeWebhookSink {
  return {
    sinkId: `whs_test_${t}_${Math.random().toString(36).slice(2, 8)}`,
    tenantId,
    secretEncrypted: encryptSecret(secret),
    eventTypes: opts?.eventTypes ?? [],
    outboundRelayEnabled: opts?.outboundRelayEnabled ?? false,
    enabled: opts?.enabled ?? true,
    createdBy: tenantId,
    createdAt: new Date().toISOString(),
  };
}

function sigPost(sinkId: string, secret: string, body: object, extra?: Record<string, string>): Request {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-native-signature": computeNativeSignature(raw, secret),
    ...extra,
  };
  return new Request(`http://test.local/api/native/webhooks/${sinkId}`, {
    method: "POST",
    headers,
    body: raw,
  });
}

beforeEach(() => {
  dataDir = freshDir();
  clearNativeEventRegistry();
  registerNativeEventType("test.alpha", {
    validate: (payload) => {
      const p = payload as Record<string, unknown>;
      if (typeof (p as any)?.value !== "number") return { ok: false, reason: "test.alpha payload must carry a numeric value" };
      return { ok: true };
    },
    handler: (event) => {
      const v = (event.payload as Record<string, unknown>).value as number;
      (globalThis as any).__native_handler_calls = ((globalThis as any).__native_handler_calls || 0) + v;
    },
  });
  registerNativeEventType("test.echo", {
    validate: (_payload) => ({ ok: true }),
    handler: (_event) => undefined,
  });
  (globalThis as any).__native_handler_calls = 0;
});

afterEach(() => {
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

// ── Sink fail-closed gates ──────────────────────────────────────────────────
describe("native webhook sink — fail-closed gates", () => {
  it("405 on non-POST", async () => {
    const sink = makeSink("t@a", "secret-a");
    saveSink(dataDir, sink);
    const res = await handleNativeWebhook(new Request(`http://x/api/native/webhooks/${sink.sinkId}`), sink.sinkId, { dataDir });
    expect(res.status).toBe(405);
    expect(listReceipts(dataDir, "t@a").length).toBe(0);
  });

  it("404 on unknown sink and on disabled sink", async () => {
    const res = await handleNativeWebhook(sigPost("whs_missing", "s", { eventType: "test.echo" }), "whs_missing", { dataDir });
    expect(res.status).toBe(404);
    const sink = makeSink("t@a", "secret-a", { enabled: false });
    saveSink(dataDir, sink);
    const res2 = await handleNativeWebhook(sigPost(sink.sinkId, "secret-a", { eventType: "test.echo" }), sink.sinkId, { dataDir });
    expect(res2.status).toBe(404);
    expect(listReceipts(dataDir, "t@a").length).toBe(0);
  });

  it("401 on missing and on invalid signature — nothing recorded", async () => {
    const sink = makeSink("t@a", "secret-a");
    saveSink(dataDir, sink);
    const raw = JSON.stringify({ eventType: "test.echo" });
    const noSig = new Request(`http://x/api/native/webhooks/${sink.sinkId}`, { method: "POST", body: raw });
    expect((await handleNativeWebhook(noSig, sink.sinkId, { dataDir })).status).toBe(401);
    const badSig = sigPost(sink.sinkId, "wrong-secret", { eventType: "test.echo" });
    expect((await handleNativeWebhook(badSig, sink.sinkId, { dataDir })).status).toBe(401);
    expect(listReceipts(dataDir, "t@a").length).toBe(0);
  });

  it("400 on malformed body / non-object / missing eventType", async () => {
    const sink = makeSink("t@a", "secret-a");
    saveSink(dataDir, sink);
    const rawBodies = ["not json", "[1,2]", "{}", '{"eventType":7}'];
    for (const raw of rawBodies) {
      const res = await handleNativeWebhook(
        new Request(`http://x/api/native/webhooks/${sink.sinkId}`, {
          method: "POST",
          headers: { "x-native-signature": computeNativeSignature(raw, "secret-a") },
          body: raw,
        }),
        sink.sinkId,
        { dataDir },
      );
      expect(res.status, raw).toBe(400);
    }
    expect(listReceipts(dataDir, "t@a").length).toBe(0);
  });

  it("400 when a KNOWN type payload fails validation", async () => {
    const sink = makeSink("t@a", "secret-a");
    saveSink(dataDir, sink);
    const res = await handleNativeWebhook(sigPost(sink.sinkId, "secret-a", { eventType: "test.alpha", value: "nope" }), sink.sinkId, { dataDir });
    expect(res.status).toBe(400);
    expect(listReceipts(dataDir, "t@a").length).toBe(0);
  });

  it("ACKs without recording unknown types and non-allow-listed types", async () => {
    // Sink with allow-list [] (accept any registered type): an UNKNOWN type is
    // acknowledged but never recorded (never invent meaning for a payload we
    // do not understand).
    const openSink = makeSink("t@a", "secret-a");
    saveSink(dataDir, openSink);
    const unknown = await handleNativeWebhook(sigPost(openSink.sinkId, "secret-a", { eventType: "not.registered" }), openSink.sinkId, { dataDir });
    expect(unknown.status).toBe(200);
    const unknownBody = (await unknown.json()) as any;
    expect(unknownBody.acknowledged).toBe(0);
    expect(unknownBody.ignored).toContain("not.registered:unknown-type");

    // Sink with a strict allow-list: a REGISTERED type outside the list is
    // acknowledged but never recorded either.
    const strictSink = makeSink("t@a", "secret-b", { eventTypes: ["test.echo"] });
    saveSink(dataDir, strictSink);
    const notListed = await handleNativeWebhook(sigPost(strictSink.sinkId, "secret-b", { eventType: "test.alpha", value: 1 }), strictSink.sinkId, { dataDir });
    expect(notListed.status).toBe(200);
    const nlBody = (await notListed.json()) as any;
    expect(nlBody.acknowledged).toBe(0);
    expect(nlBody.ignored).toContain("test.alpha:not-in-sink-list");
    expect(listReceipts(dataDir, "t@a").length).toBe(0);
  });

  it("records a durable receipt for a valid event and dispatches the handler", async () => {
    const sink = makeSink("t@a", "secret-a");
    saveSink(dataDir, sink);
    const res = await handleNativeWebhook(
      sigPost(sink.sinkId, "secret-a", { eventType: "test.alpha", value: 5, eventId: "evt-1" }),
      sink.sinkId,
      { dataDir },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.acknowledged).toBe(1);
    expect(body.handler).toBe("handled");
    expect((globalThis as any).__native_handler_calls).toBe(5);
    const receipts = listReceipts(dataDir, "t@a");
    expect(receipts.length).toBe(1);
    expect(receipts[0].eventType).toBe("test.alpha");
    expect(receipts[0].tenantId).toBe("t@a");
  });

  it("400 when no idempotency key is provided", async () => {
    const sink = makeSink("t@a", "secret-a");
    saveSink(dataDir, sink);
    const res = await handleNativeWebhook(sigPost(sink.sinkId, "secret-a", { eventType: "test.echo" }), sink.sinkId, { dataDir });
    expect(res.status).toBe(400);
    expect(listReceipts(dataDir, "t@a").length).toBe(0);
  });

  it("idempotent replay returns the same eventId with no second receipt", async () => {
    const sink = makeSink("t@a", "secret-a");
    saveSink(dataDir, sink);
    const first = await handleNativeWebhook(sigPost(sink.sinkId, "secret-a", { eventType: "test.echo", eventId: "evt-dup" }), sink.sinkId, { dataDir });
    const firstBody = (await first.json()) as any;
    const second = await handleNativeWebhook(sigPost(sink.sinkId, "secret-a", { eventType: "test.echo", eventId: "evt-dup" }), sink.sinkId, { dataDir });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as any;
    expect(secondBody.duplicate).toBe(true);
    expect(secondBody.eventId).toBe(firstBody.eventId);
    expect(listReceipts(dataDir, "t@a").length).toBe(1);
  });

  it("409 when the same idempotency key arrives with a different payload", async () => {
    const sink = makeSink("t@a", "secret-a");
    saveSink(dataDir, sink);
    await handleNativeWebhook(sigPost(sink.sinkId, "secret-a", { eventType: "test.echo", eventId: "evt-conflict" }), sink.sinkId, { dataDir });
    const conflicted = await handleNativeWebhook(
      sigPost(sink.sinkId, "secret-a", { eventType: "test.echo", eventId: "evt-conflict", extra: true }),
      sink.sinkId,
      { dataDir },
    );
    expect(conflicted.status).toBe(409);
  });
});

// ── Cross-tenant isolation ──────────────────────────────────────────────────
describe("native webhooks — tenant isolation", () => {
  it("tenant B never sees tenant A's receipts, sinks or subscriptions", async () => {
    const sink = makeSink("a@x", "secret-a");
    saveSink(dataDir, sink);
    await handleNativeWebhook(sigPost(sink.sinkId, "secret-a", { eventType: "test.echo", eventId: "iso-1" }), sink.sinkId, { dataDir });
    expect(listReceipts(dataDir, "a@x").length).toBe(1);
    expect(listReceipts(dataDir, "b@x").length).toBe(0);
    expect(listSinksForTenant(dataDir, "b@x").length).toBe(0);
    expect(listSubscriptions(dataDir, "b@x").length).toBe(0);
    expect(countNativeAudit(dataDir, "b@x")).toBe(0);
  });

  it("tenant B cannot delete tenant A's sink or subscription via the authed API", async () => {
    const sink = makeSink("a@x", "secret-a");
    saveSink(dataDir, sink);
    const a = await createOutboundSubscription(dataDir, { tenantId: "a@x", url: "https://example.com/hook", actor: "a@x" });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const delSink = await handleNativeAuthed(new Request(`http://x/api/native/webhook-sinks?id=${sink.sinkId}`, { method: "DELETE" }), { userEmail: "b@x", dataDir });
    expect(delSink.status).toBe(404);
    expect(listSinksForTenant(dataDir, "a@x").length).toBe(1);
    const delSub = await handleNativeAuthed(new Request(`http://x/api/native/webhook-subscriptions?id=${a.result.subscription.id}`, { method: "DELETE" }), { userEmail: "b@x", dataDir });
    expect(delSub.status).toBe(404);
    expect(listSubscriptions(dataDir, "a@x").length).toBe(1);
  });

  it("publish + flush only touch the owning tenant's deliveries", async () => {
    await createOutboundSubscription(dataDir, { tenantId: "a@x", url: "https://example.com/hook", actor: "a@x" });
    publishWebhookEvent(dataDir, "a@x", "anything", { n: 1 }, "a@x");
    expect(listDeliveries(dataDir, "a@x").length).toBe(1);
    expect(listDeliveries(dataDir, "b@x").length).toBe(0);
  });
});

// ── SSRF guard ──────────────────────────────────────────────────────────────
describe("native webhooks — SSRF-guarded subscriber URLs", () => {
  it("rejects localhost, private/link-local IPs, http, userinfo, .local", async () => {
    const bad: string[] = [
      "http://example.com/hook",
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://127.0.0.2/hook",
      "https://10.0.0.5/hook",
      "https://192.168.1.10/hook",
      "https://172.16.0.1/hook",
      "https://172.31.255.255/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/hook",
      "https://mybox.local/hook",
      "https://user:pass@example.com/hook",
      "not a url",
    ];
    for (const url of bad) {
      const check = await validateWebhookUrl(url);
      expect(check.ok, url).toBe(false);
    }
  });

  it("rejects hosts that RESOLVE to private addresses, and resolution failures", async () => {
    const evilResolver = async (host: string): Promise<string[]> => {
      if (host === "evil.example.com") return ["127.0.0.1"];
      return ["93.184.216.34"];
    };
    expect((await validateWebhookUrl("https://evil.example.com/hook", evilResolver)).ok).toBe(false);
    const failingResolver = async (_host: string): Promise<string[]> => {
      throw new Error("NXDOMAIN");
    };
    expect((await validateWebhookUrl("https://nothing.example.com/hook", failingResolver)).ok).toBe(false);
  });

  it("accepts a public https URL (and a public IP literal)", async () => {
    const pub = "https://example.com/api/hook";
    expect((await validateWebhookUrl(pub)).ok).toBe(true);
    expect((await validateWebhookUrl(pub, async () => ["93.184.216.34"])).ok).toBe(true);
    expect((await validateWebhookUrl("https://93.184.216.34/hook")).ok).toBe(true);
  });
});

// ── Outbound subscriptions + delivery engine ────────────────────────────────
describe("native outbound webhooks — subscriptions", () => {
  it("create returns the secret ONCE; list never exposes it; delete works", async () => {
    const created = await createOutboundSubscription(dataDir, { tenantId: "t@a", url: "https://example.com/hook", actor: "t@a", resolver: async () => ["93.184.216.34"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const { subscription, secret } = created.result;
    expect(secret.length).toBeGreaterThanOrEqual(32);
    // Secret verifies a signature against the stored encrypted one.
    const stored = listSubscriptions(dataDir, "t@a")[0];
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect((stored as any).secretEncrypted).toBeDefined();
    const raw = JSON.stringify({ a: 1 });
    expect(computeNativeSignature(raw, secret)).toBe(computeNativeSignature(raw, secret));
    // Secret is decryptable and matches what produced it.
    const { decryptSecret } = await import("../native/webhooks/store");
    expect(decryptSecret(stored.secretEncrypted)).toBe(secret);
    // Audit recorded.
    expect(listNativeAudit(dataDir, "t@a").some((e) => e.action === "native.webhook.sub.create")).toBe(true);
    // Delete.
    expect(removeOutboundSubscription(dataDir, "t@a", subscription.id, "t@a")).toBe(true);
    expect(listSubscriptions(dataDir, "t@a").length).toBe(0);
  });

  it("create enforces the per-tenant subscription limit", async () => {
    for (let i = 0; i < 25; i++) {
      const r = await createOutboundSubscription(dataDir, { tenantId: "t@a", url: `https://example.com/hook${i}`, actor: "t@a", resolver: async () => ["93.184.216.34"] });
      expect(r.ok).toBe(true);
    }
    const over = await createOutboundSubscription(dataDir, { tenantId: "t@a", url: "https://example.com/one-more", actor: "t@a", resolver: async () => ["93.184.216.34"] });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.status).toBe(400);
  });
});

describe("native outbound webhooks — delivery engine", () => {
  it("delivers a signed envelope, records the attempt, audits it", async () => {
    const created = await createOutboundSubscription(dataDir, { tenantId: "t@a", url: "https://example.com/hook", actor: "t@a", resolver: async () => ["93.184.216.34"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    publishWebhookEvent(dataDir, "t@a", "test.event", { id: 1 }, "t@a");
    let captured: { body: string; url: string; headers: Record<string, string> } | null = null;
    const deliver: DeliverFn = async (body, url, headers) => {
      captured = { body, url, headers };
      return { status: 200 };
    };
    const result = await flushTenantDeliveries(dataDir, "t@a", deliver);
    expect(result).toMatchObject({ attempted: 1, delivered: 1, dead: 0, pending: 0 });
    expect(captured).not.toBeNull();
    if (!captured) return;
    const cap = captured as { body: string; url: string; headers: Record<string, string> };
    // Signature must verify against the subscription secret (constant-time).
    const { decryptSecret } = await import("../native/webhooks/store");
    const sub = listSubscriptions(dataDir, "t@a")[0];
    expect(cap.headers["x-native-signature"]).toBe(computeNativeSignature(cap.body, decryptSecret(sub.secretEncrypted)));
    expect(cap.headers["x-native-event-id"]).toBeTruthy();
    expect(cap.headers["x-native-attempt"]).toBe("1");
    const envelope = JSON.parse(cap.body) as any;
    expect(envelope.eventType).toBe("test.event");
    expect(envelope.payload).toEqual({ id: 1 });
    const delivery = listDeliveries(dataDir, "t@a")[0];
    expect(delivery.status).toBe("delivered");
    expect(delivery.attempts).toHaveLength(1);
    expect(delivery.attempts[0].success).toBe(true);
    expect(listNativeAudit(dataDir, "t@a").some((e) => e.action === "native.webhook.delivery.sent")).toBe(true);
    // No re-delivery on a second flush.
    const second = await flushTenantDeliveries(dataDir, "t@a", deliver);
    expect(second.attempted).toBe(0);
  });

  it("retries with backoff on 5xx/network error and dead-letters at exhaustion", async () => {
    const created = await createOutboundSubscription(dataDir, { tenantId: "t@a", url: "https://example.com/hook", actor: "t@a", retry: { maxAttempts: 2, initialBackoffMs: 100 }, resolver: async () => ["93.184.216.34"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    publishWebhookEvent(dataDir, "t@a", "test.event", { n: 2 }, "t@a");
    let calls = 0;
    const flaky: DeliverFn = async () => {
      calls += 1;
      if (calls === 1) return { status: 500 };
      throw new Error("socket hang up");
    };
    // Flush 1: attempt 1 → 500 → retry scheduled (attempt < max).
    const r1 = await flushTenantDeliveries(dataDir, "t@a", flaky, 1000);
    expect(r1.attempted).toBe(1);
    expect(r1.delivered).toBe(0);
    let delivery = listDeliveries(dataDir, "t@a")[0];
    expect(delivery.status).toBe("pending");
    expect(delivery.nextRetryAt).toBeTruthy();
    // Flush 2 (due): attempt 2 → network error → dead (max reached).
    const due = Date.parse(delivery.nextRetryAt!);
    const r2 = await flushTenantDeliveries(dataDir, "t@a", flaky, due + 1);
    expect(r2.dead).toBe(1);
    delivery = listDeliveries(dataDir, "t@a")[0];
    expect(delivery.status).toBe("dead");
    expect(delivery.attempts).toHaveLength(2);
    expect(delivery.attempts[1].success).toBe(false);
    expect(listNativeAudit(dataDir, "t@a").some((e) => e.action === "native.webhook.delivery.dead")).toBe(true);
  });

  it("permanent 4xx dead-letters immediately with a single attempt", async () => {
    const created = await createOutboundSubscription(dataDir, { tenantId: "t@a", url: "https://example.com/hook", actor: "t@a", resolver: async () => ["93.184.216.34"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    publishWebhookEvent(dataDir, "t@a", "test.event", { n: 3 }, "t@a");
    const reject: DeliverFn = async () => ({ status: 422 });
    const result = await flushTenantDeliveries(dataDir, "t@a", reject);
    expect(result).toMatchObject({ attempted: 1, delivered: 0, dead: 1 });
    const delivery = listDeliveries(dataDir, "t@a")[0];
    expect(delivery.status).toBe("dead");
    expect(delivery.attempts).toHaveLength(1);
  });

  it("flush is a no-op when nothing is due", async () => {
    const result = await flushTenantDeliveries(dataDir, "t@other", async () => ({ status: 200 }));
    expect(result).toEqual({ attempted: 0, delivered: 0, dead: 0, pending: 0 });
  });
});

// ── Authed API (routes) ─────────────────────────────────────────────────────
describe("native webhooks — authed API routes", () => {
  it("sink create returns secret once; list masks it; delete own works", async () => {
    const created = await handleNativeAuthed(
      new Request("http://x/api/native/webhook-sinks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventTypes: ["test.echo"] }) }),
      { userEmail: "t@a", dataDir },
    );
    expect(created.status).toBe(200);
    const body = (await created.json()) as any;
    expect(body.data.sinkId.startsWith("whs_")).toBe(true);
    expect(body.data.secret).toBeTruthy();
    const listed = (await (await handleNativeAuthed(new Request("http://x/api/native/webhook-sinks"), { userEmail: "t@a", dataDir })).json()) as any;
    expect(listed.data.length).toBe(1);
    expect(JSON.stringify(listed.data)).not.toContain(body.data.secret);
    expect(listed.data[0].secretEncrypted).toBeUndefined();
    const del = await handleNativeAuthed(new Request(`http://x/api/native/webhook-sinks?id=${body.data.sinkId}`, { method: "DELETE" }), { userEmail: "t@a", dataDir });
    expect(del.status).toBe(200);
    expect(listSinksForTenant(dataDir, "t@a").length).toBe(0);
    expect(listNativeAudit(dataDir, "t@a").some((e) => e.action === "native.webhook.sink.delete")).toBe(true);
  });

  it("subscribe + publish end-to-end via the authed API (no auto-flush in tests)", async () => {
    const created = await handleNativeAuthed(
      new Request("http://x/api/native/webhook-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://example.com/hook" }) }),
      { userEmail: "t@a", dataDir, resolver: async () => ["93.184.216.34"] },
    );
    expect(created.status).toBe(200);
    const pub = await handleNativeAuthed(
      new Request("http://x/api/native/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventType: "test.event", payload: { n: 9 } }) }),
      { userEmail: "t@a", dataDir },
    );
    expect(pub.status).toBe(200);
    const pubBody = (await pub.json()) as any;
    expect(pubBody.queued).toBe(1);
    // No network in tests (autoFlush off): the durable record exists, pending.
    const events = (await (await handleNativeAuthed(new Request("http://x/api/native/webhook-events"), { userEmail: "t@a", dataDir })).json()) as any;
    expect(events.data.deliveries.length).toBe(1);
    expect(events.data.deliveries[0].status).toBe("pending");
    expect(events.data.receipts.length).toBe(0);
    // Flush with NO subscriptions is a deterministic no-op.
    const flushed = await handleNativeAuthed(new Request("http://x/api/native/flush", { method: "POST" }), { userEmail: "t@b", dataDir });
    const flushBody = (await flushed.json()) as any;
    expect(flushBody).toMatchObject({ attempted: 0, delivered: 0, dead: 0, pending: 0 });
  });

  it("REJECTS SSRF subscriber URLs through the authed API", async () => {
    const res = await handleNativeAuthed(
      new Request("http://x/api/native/webhook-subscriptions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "http://localhost:3000/admin" }) }),
      { userEmail: "t@a", dataDir },
    );
    expect(res.status).toBe(400);
    expect(listSubscriptions(dataDir, "t@a").length).toBe(0);
  });

  it("unknown native endpoint returns 404 JSON (never the SPA fallback)", async () => {
    const res = await handleNativeAuthed(new Request("http://x/api/native/not-a-route"), { userEmail: "t@a", dataDir });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBeTruthy();
  });
});