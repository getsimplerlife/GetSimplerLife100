import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  XERO_MONITOR_EVENT_MAP,
  XERO_MONITOR_EMPLOYEE_ID,
  buildXeroMonitoredEvent,
  computeXeroWebhookSignature,
  constantTimeEqual,
  handleXeroWebhook,
  latestXeroWebhookReceipt,
  mapXeroEventType,
  parseXeroWebhookEvents,
  recordXeroWebhookReceipt,
  verifyXeroWebhookSignature,
  xeroEventId,
  type XeroWebhookDeps,
} from "../monitoring/xero-webhook";

const WEBHOOK_KEY = "whsec-test-key-123";

function deps(overrides: Partial<XeroWebhookDeps> = {}): XeroWebhookDeps & { dispatched: any[]; receipts: any[] } {
  const dispatched: any[] = [];
  const receipts: any[] = [];
  return {
    getWebhookKey: () => WEBHOOK_KEY,
    ensureOrgGate: async () => true,
    dispatch: async (event) => {
      dispatched.push(event);
      return { eventId: event.id, status: "processed" as const, dispatchedTo: event.employeeId };
    },
    recordReceipt: (receipt) => {
      receipts.push(receipt);
    },
    ...overrides,
    dispatched,
    receipts,
  };
}

const signedPost = async (path: string, body: unknown, opts: { key?: string | null; webhookKey?: string } = {}) => {
  const rawBody = JSON.stringify(body);
  const headerValue = opts.key !== undefined ? opts.key : await computeXeroWebhookSignature(rawBody, opts.webhookKey || WEBHOOK_KEY);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (headerValue !== null) headers["Xero-Webhook-Key"] = headerValue;
  return new Request(`https://example.test${path}`, { method: "POST", headers, body: rawBody });
};

describe("verifyXeroWebhookSignature", () => {
  it("accepts a valid HMAC-SHA256 base64 signature (Xero POST scheme)", async () => {
    const rawBody = JSON.stringify({ events: [] });
    const sig = await computeXeroWebhookSignature(rawBody, WEBHOOK_KEY);
    expect(await verifyXeroWebhookSignature(rawBody, sig, WEBHOOK_KEY)).toBe(true);
  });
  it("accepts the plaintext webhook key (handshake-style)", async () => {
    expect(await verifyXeroWebhookSignature("{}", WEBHOOK_KEY, WEBHOOK_KEY)).toBe(true);
  });
  it("rejects a wrong key, a tampered body and an empty header", async () => {
    const rawBody = JSON.stringify({ events: [] });
    const sig = await computeXeroWebhookSignature(rawBody, WEBHOOK_KEY);
    expect(await verifyXeroWebhookSignature(rawBody, sig, "different-key")).toBe(false);
    expect(await verifyXeroWebhookSignature(rawBody + " ", sig, WEBHOOK_KEY)).toBe(false);
    expect(await verifyXeroWebhookSignature(rawBody, null, WEBHOOK_KEY)).toBe(false);
    expect(await verifyXeroWebhookSignature(rawBody, "", WEBHOOK_KEY)).toBe(false);
  });
});

describe("parseXeroWebhookEvents", () => {
  it("parses a canonical Xero events envelope", () => {
    const result = parseXeroWebhookEvents(JSON.stringify({ events: [{ eventType: "INVOICE.CREATED", resourceId: "r-1", tenantId: "org-1" }] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.events[0].eventType).toBe("INVOICE.CREATED");
  });
  it("fails closed on malformed JSON, non-object payload, missing events array, and events without eventType", () => {
    expect(parseXeroWebhookEvents("not-json").ok).toBe(false);
    expect(parseXeroWebhookEvents("42").ok).toBe(false);
    expect(parseXeroWebhookEvents(JSON.stringify({ events: "nope" })).ok).toBe(false);
    expect(parseXeroWebhookEvents(JSON.stringify({ events: [{ resourceId: "x" }] })).ok).toBe(false);
  });
});

describe("mapXeroEventType + event id", () => {
  it("maps INVOICE.CREATED and BILL.CREATED to the monitor contracts, unknown to null", () => {
    expect(mapXeroEventType("INVOICE.CREATED")).toBe("xero-monitor-invoice-created");
    expect(mapXeroEventType("BILL.CREATED")).toBe("xero-monitor-bill-created");
    expect(mapXeroEventType("CONTACT.CREATED")).toBeNull();
  });
  it("builds a stable dedupe id from tenant+type+resource", () => {
    const a = { tenantId: "org-1", eventType: "INVOICE.CREATED", resourceId: "inv-9" };
    const b = { tenantId: "org-1", eventType: "INVOICE.CREATED", resourceId: "inv-9" };
    expect(xeroEventId(a)).toBe(xeroEventId(b));
    expect(xeroEventId(a)).not.toBe(xeroEventId({ tenantId: "org-2", eventType: "INVOICE.CREATED", resourceId: "inv-9" }));
  });
  it("builds a MonitoredEvent scoped to the invoice_ledger employee with the contract in payload", () => {
    const evt = buildXeroMonitoredEvent({ tenantId: "org-1", eventType: "INVOICE.CREATED", resourceId: "inv-1" }, "xero-monitor-invoice-created");
    expect(evt.employeeId).toBe(XERO_MONITOR_EMPLOYEE_ID);
    expect(evt.providerId).toBe("xero");
    expect(evt.tenantId).toBe("org-1");
    expect(evt.payload).toMatchObject({ capabilityId: "xero-monitor-invoice-created", eventType: "INVOICE.CREATED" });
  });
});

describe("handleXeroWebhook — GET handshake", () => {
  it("echoes the webhook key with 200 (Xero activation handshake)", async () => {
    const response = await handleXeroWebhook(
      new Request("https://example.test/api/monitoring/webhook/xero", { headers: { "Xero-Webhook-Key": WEBHOOK_KEY } }),
      deps(),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(WEBHOOK_KEY);
  });
  it("rejects a missing or wrong handshake key with 401", async () => {
    const base = "https://example.test/api/monitoring/webhook/xero";
    expect((await handleXeroWebhook(new Request(base), deps())).status).toBe(401);
    expect((await handleXeroWebhook(new Request(base, { headers: { "Xero-Webhook-Key": "wrong" } }), deps())).status).toBe(401);
  });
  it("fails closed with 503 when XERO_WEBHOOK_KEY is unset", async () => {
    const d = deps({ getWebhookKey: () => undefined });
    const response = await handleXeroWebhook(new Request("https://example.test/api/monitoring/webhook/xero", { headers: { "Xero-Webhook-Key": WEBHOOK_KEY } }), d);
    expect(response.status).toBe(503);
  });
});

describe("handleXeroWebhook — POST events", () => {
  beforeEach(async () => {
    // clear in-memory dedupe/lease state so tests are isolated
    const { clearSeen } = await import("../monitoring/dedupe");
    clearSeen();
  });

  it("maps INVOICE.CREATED to xero-monitor-invoice-created and dispatches", async () => {
    const d = deps();
    const response = await handleXeroWebhook(
      await signedPost("/api/monitoring/webhook/xero", {
        events: [{ eventType: "INVOICE.CREATED", eventCategory: "INVOICE", resourceId: "inv-1", resourceUrl: "https://api.xero.com/api.xro/2.0/Invoices/inv-1", eventDateUtc: "2026-08-14T00:00:00Z", tenantId: "org-1" }],
      }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(1);
    expect(body.failed).toBe(0);
    expect(body.outcomes[0]).toMatchObject({ eventType: "INVOICE.CREATED", capabilityId: "xero-monitor-invoice-created", status: "processed" });
    expect(d.dispatched).toHaveLength(1);
    expect(d.dispatched[0]).toMatchObject({ providerId: "xero", eventType: "INVOICE.CREATED", tenantId: "org-1" });
    expect(d.receipts[0]).toMatchObject({ capabilityId: "xero-monitor-invoice-created", outcome: "processed" });
  });

  it("maps BILL.CREATED to xero-monitor-bill-created and dispatches", async () => {
    const d = deps();
    const response = await handleXeroWebhook(
      await signedPost("/api/monitoring/webhook/xero", { events: [{ eventType: "BILL.CREATED", resourceId: "bill-1", tenantId: "org-1" }] }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcomes[0]).toMatchObject({ capabilityId: "xero-monitor-bill-created", status: "processed" });
    expect(d.dispatched[0].payload).toMatchObject({ capabilityId: "xero-monitor-bill-created" });
  });

  it("accepts the HMAC when Xero sends it in the Xero-Webhook-Signature header (documented scheme)", async () => {
    const d = deps();
    const rawBody = JSON.stringify({ events: [{ eventType: "BILL.CREATED", resourceId: "bill-sig-1", tenantId: "org-1" }] });
    const sig = await computeXeroWebhookSignature(rawBody, WEBHOOK_KEY);
    const response = await handleXeroWebhook(
      new Request("https://example.test/api/monitoring/webhook/xero", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Xero-Webhook-Signature": sig },
        body: rawBody,
      }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.outcomes[0]).toMatchObject({ capabilityId: "xero-monitor-bill-created", status: "processed" });
    expect(d.receipts[0]).toMatchObject({ capabilityId: "xero-monitor-bill-created" });
  });

  it("rejects a wrong signature with 401 and never dispatches", async () => {
    const d = deps();
    const response = await handleXeroWebhook(
      await signedPost("/api/monitoring/webhook/xero", { events: [{ eventType: "INVOICE.CREATED", resourceId: "inv-1", tenantId: "org-1" }] }, { key: "c2lnbmF0dXJlLWJ1dC13cm9uZw==" }),
      d,
    );
    expect(response.status).toBe(401);
    expect(d.dispatched).toHaveLength(0);
    expect(d.receipts).toHaveLength(0);
  });

  it("rejects a missing header with 401 and never dispatches", async () => {
    const d = deps();
    const response = await handleXeroWebhook(
      new Request("https://example.test/api/monitoring/webhook/xero", { method: "POST", body: JSON.stringify({ events: [] }) }),
      d,
    );
    expect(response.status).toBe(401);
    expect(d.dispatched).toHaveLength(0);
  });

  it("acks unknown event types (not in subscription) without dispatching", async () => {
    const d = deps();
    const response = await handleXeroWebhook(
      await signedPost("/api/monitoring/webhook/xero", { events: [{ eventType: "CONTACT.CREATED", resourceId: "c-1", tenantId: "org-1" }] }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.processed).toBe(0);
    expect(body.ignored).toEqual(["CONTACT.CREATED"]);
    expect(d.dispatched).toHaveLength(0);
    expect(d.receipts).toHaveLength(0);
  });

  it("fails closed on malformed JSON and missing events array", async () => {
    const d = deps();
    const bad1 = await handleXeroWebhook(await signedPost("/api/monitoring/webhook/xero", "not-json" as unknown), d);
    expect(bad1.status).toBe(400);
    const bad2 = await handleXeroWebhook(await signedPost("/api/monitoring/webhook/xero", { hello: "world" }), d);
    expect(bad2.status).toBe(400);
    expect(d.dispatched).toHaveLength(0);
  });

  it("acks an authenticated event for an unentitled org but never records a receipt", async () => {
    // Mirror the real dispatcher: it fails events whose tenant gate is absent.
    const d = deps({
      ensureOrgGate: async () => false,
      dispatch: async (event) => ({ eventId: event.id, status: "failed" as const, reason: "Tenant is not entitled to monitoring" }),
    });
    const response = await handleXeroWebhook(
      await signedPost("/api/monitoring/webhook/xero", { events: [{ eventType: "INVOICE.CREATED", resourceId: "inv-1", tenantId: "org-unknown" }] }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.failed).toBe(1);
    expect(d.receipts).toHaveLength(0);
  });

  it("returns 503 when the webhook key is unset", async () => {
    const d = deps({ getWebhookKey: () => undefined });
    const response = await handleXeroWebhook(await signedPost("/api/monitoring/webhook/xero", { events: [] }), d);
    expect(response.status).toBe(503);
  });

  it("rejects non-GET/POST methods with 405", async () => {
    const d = deps();
    const response = await handleXeroWebhook(new Request("https://example.test/api/monitoring/webhook/xero", { method: "PUT", body: "{}" }), d);
    expect(response.status).toBe(405);
  });
});

describe("live-receipt log", () => {
  it("records receipts and latestXeroWebhookReceipt returns the newest processed one within TTL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "xero-webhook-test-"));
    try {
      await recordXeroWebhookReceipt(
        { capabilityId: "xero-monitor-invoice-created", eventId: "e1", eventType: "INVOICE.CREATED", tenantId: "org-1", outcome: "processed", receivedAt: new Date(Date.now() - 60_000).toISOString() },
        dir,
      );
      await recordXeroWebhookReceipt(
        { capabilityId: "xero-monitor-invoice-created", eventId: "e2", eventType: "INVOICE.CREATED", tenantId: "org-1", outcome: "processed", receivedAt: new Date().toISOString() },
        dir,
      );
      const latest = latestXeroWebhookReceipt("xero-monitor-invoice-created", dir, 24 * 60 * 60 * 1000);
      expect(latest?.eventId).toBe("e2");
      expect(latestXeroWebhookReceipt("xero-monitor-bill-created", dir, 24 * 60 * 60 * 1000)).toBeUndefined();
      // stale receipts expire out of the TTL window
      const staleDir = mkdtempSync(join(tmpdir(), "xero-webhook-stale-"));
      await recordXeroWebhookReceipt(
        { capabilityId: "xero-monitor-invoice-created", eventId: "old", eventType: "INVOICE.CREATED", tenantId: "org-1", outcome: "processed", receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
        staleDir,
      );
      expect(latestXeroWebhookReceipt("xero-monitor-invoice-created", staleDir, 24 * 60 * 60 * 1000)).toBeUndefined();
      rmSync(staleDir, { recursive: true, force: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("end-to-end through the real dispatcher", () => {
  it("processes a signed event when the org gate is configured, then the receipt verifies the contract", async () => {
    const { clearTenants, configureTenant, clearSeen } = await import("../monitoring/gates");
    const { clearSeen: clearSeenDedupe } = await import("../monitoring/dedupe");
    clearTenants();
    clearSeenDedupe();
    configureTenant("org-1", { purchased: true, status: "Active" });
    const { dispatch } = await import("../monitoring/dispatcher");

    const dir = mkdtempSync(join(tmpdir(), "xero-webhook-e2e-"));
    try {
      const d = deps({
        ensureOrgGate: async () => true,
        dispatch(event) {
          return dispatch(
            event,
            { employeeId: XERO_MONITOR_EMPLOYEE_ID, providerId: "xero", eventTypes: [event.eventType] },
            { holderId: "webhook-xero", execute: async () => {} },
          );
        },
        recordReceipt: (receipt) => recordXeroWebhookReceipt(receipt, dir),
      });
      const response = await handleXeroWebhook(
        await signedPost("/api/monitoring/webhook/xero", {
          events: [{ eventType: "INVOICE.CREATED", resourceId: "inv-live-1", tenantId: "org-1" }],
        }),
        d,
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.processed).toBe(1);
      const latest = latestXeroWebhookReceipt("xero-monitor-invoice-created", dir, 24 * 60 * 60 * 1000);
      expect(latest?.eventId).toBe("xero:org-1:INVOICE.CREATED:inv-live-1");
      // duplicate delivery of the same event is skipped by the dispatcher (dedupe)
      const dup = await handleXeroWebhook(
        await signedPost("/api/monitoring/webhook/xero", {
          events: [{ eventType: "INVOICE.CREATED", resourceId: "inv-live-1", tenantId: "org-1" }],
        }),
        d,
      );
      expect((await dup.json()).skipped).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      clearTenants();
    }
  });
});

describe("constantTimeEqual", () => {
  it("compares without leaking length mismatches to the result path", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
  it("covers every contract in the map", () => {
    expect(Object.keys(XERO_MONITOR_EVENT_MAP).sort()).toEqual(["BILL.CREATED", "INVOICE.CREATED"]);
  });
});
