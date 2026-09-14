/**
 * quickbooks-webhook.test.ts — QuickBooks Online webhook receiver.
 *
 * Covers the fail-closed contract of src/monitoring/quickbooks-webhook.ts:
 *   - signature verification (valid / wrong token / tampered body / missing
 *     header / missing env token), constant-time compare;
 *   - LEGACY payload parsing ({ eventNotifications: [...] }, NOT cloud-event);
 *   - fail-closed 401s before any receipt is recorded;
 *   - durable receipt recording (timestamp, realmId, entity, operation, id,
 *     raw payload hash) so the monitor verification contracts can later verify
 *     against a REAL Intuit event — never fabricated;
 *   - route wiring e2e against the self-hosted test server (the exact URL the
 *     Intuit "Set up endpoints" page gets).
 */
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QBO_MONITOR_EVENT_MAP, QBO_RECEIPTS_FILE, QBO_SIGNATURE_HEADER, computeQboWebhookSignature, constantTimeEqual, handleQuickbooksWebhook, latestQboWebhookReceipt, mapQboEntity, parseQboWebhookPayload, qboEventId, qboRawPayloadHash, readQboWebhookReceipts, recordQboWebhookReceipt, verifyQboWebhookSignature, type QboWebhookDeps, type QboWebhookReceipt } from "../monitoring/quickbooks-webhook";

const VERIFIER = "qbo-verifier-token-abc123";
const LEGACY_PAYLOAD = {
  eventNotifications: [
    {
      realmId: "123145876987654",
      dataChangeEvent: {
        entities: [
          { name: "Invoice", id: "91", operation: "Create", lastUpdated: "2026-09-08T12:00:00.000Z" },
          { name: "Customer", id: "55", operation: "Create", lastUpdated: "2026-09-08T12:00:01.000Z" },
        ],
      },
    },
  ],
};

function deps(overrides: Partial<QboWebhookDeps> = {}): QboWebhookDeps & { receipts: QboWebhookReceipt[] } {
  const receipts: QboWebhookReceipt[] = [];
  return {
    getVerifierToken: () => VERIFIER,
    recordReceipt: (receipt) => {
      receipts.push(receipt);
    },
    ...overrides,
    receipts,
  };
}
const signedPost = async (body: unknown, opts: { token?: string | null; verifier?: string } = {}) => {
  const rawBody = JSON.stringify(body);
  const headerValue =
    opts.token !== undefined ? opts.token : await computeQboWebhookSignature(rawBody, opts.verifier || VERIFIER);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (headerValue !== null) headers[QBO_SIGNATURE_HEADER] = headerValue;
  return new Request("https://example.test" + "/api/webhooks/quickbooks", { method: "POST", headers, body: rawBody });
};

describe("QBO signature scheme (reference-checked)", () => {
  it("computes the exact Intuit scheme: base64(HMAC-SHA256(rawBody, verifier))", async () => {
    const rawBody = JSON.stringify(LEGACY_PAYLOAD);
    const expected = createHmac("sha256", VERIFIER).update(rawBody).digest("base64");
    expect(await computeQboWebhookSignature(rawBody, VERIFIER)).toBe(expected);
    expect(expected.length).toBeGreaterThan(20);
  });
  it("verify accepts a valid signature and rejects wrong token / tampered body / missing header", async () => {
    const rawBody = JSON.stringify(LEGACY_PAYLOAD);
    const sig = await computeQboWebhookSignature(rawBody, VERIFIER);
    expect(await verifyQboWebhookSignature(rawBody, sig, VERIFIER)).toBe(true);
    expect(await verifyQboWebhookSignature(rawBody, sig, "different-token")).toBe(false);
    expect(await verifyQboWebhookSignature(rawBody + " ", sig, VERIFIER)).toBe(false);
    expect(await verifyQboWebhookSignature(rawBody, null, VERIFIER)).toBe(false);
    expect(await verifyQboWebhookSignature(rawBody, "", VERIFIER)).toBe(false);
  });
  it("constantTimeEqual never short-circuits on length-mismatch content and handles empties", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("parseQboWebhookPayload (LEGACY format)", () => {
  it("parses a canonical legacy eventNotifications envelope", () => {
    const result = parseQboWebhookPayload(JSON.stringify(LEGACY_PAYLOAD));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.notifications[0].realmId).toBe("123145876987654");
      expect(result.notifications[0].dataChangeEvent?.entities).toHaveLength(2);
    }
  });
  it("accepts the empty eventNotifications validation probe (Intuit saves the endpoint)", () => {
    const result = parseQboWebhookPayload(JSON.stringify({ eventNotifications: [] }));
    expect(result.ok).toBe(true);
  });
  it("fails closed on malformed JSON, non-object, missing / non-array eventNotifications, bad notifications", () => {
    expect(parseQboWebhookPayload("not-json").ok).toBe(false);
    expect(parseQboWebhookPayload("42").ok).toBe(false);
    expect(parseQboWebhookPayload(JSON.stringify({ hello: "world" })).ok).toBe(false);
    expect(parseQboWebhookPayload(JSON.stringify({ eventNotifications: "nope" })).ok).toBe(false);
    expect(parseQboWebhookPayload(JSON.stringify({ eventNotifications: [{}] })).ok).toBe(false);
    expect(parseQboWebhookPayload(JSON.stringify({ eventNotifications: [{ realmId: "123" }] })).ok).toBe(false);
    expect(
      parseQboWebhookPayload(JSON.stringify({ eventNotifications: [{ realmId: "123", dataChangeEvent: {} }] })).ok,
    ).toBe(false);
  });
  it("covers exactly the two subscribed contracts (Invoice/Customer Create)", () => {
    expect(mapQboEntity("Invoice", "Create")).toBe("quickbooks-monitor-invoice-created");
    expect(mapQboEntity("Customer", "Create")).toBe("quickbooks-monitor-customer-created");
    expect(mapQboEntity("Invoice", "Update")).toBeNull();
    expect(mapQboEntity("Vendor", "Create")).toBeNull();
    expect(mapQboEntity("Invoice", "")).toBeNull();
    expect(mapQboEntity(undefined, "Create")).toBeNull();
    expect(Object.keys(QBO_MONITOR_EVENT_MAP).sort()).toEqual(["Customer.Create", "Invoice.Create"]);
  });
  it("builds a stable event id from realmId + entity + id + operation", () => {
    const a = qboEventId("123", { name: "Invoice", id: "91", operation: "Create" });
    const b = qboEventId("123", { name: "Invoice", id: "91", operation: "Create" });
    expect(a).toBe(b);
    expect(a).not.toBe(qboEventId("456", { name: "Invoice", id: "91", operation: "Create" }));
    expect(a).toBe("qbo:123:Invoice:91:Create");
  });
  it("hashes the raw body exactly (hex sha256, deterministic)", () => {
    const raw = JSON.stringify(LEGACY_PAYLOAD);
    expect(qboRawPayloadHash(raw)).toBe(qboRawPayloadHash(raw));
    expect(qboRawPayloadHash(raw)).not.toBe(qboRawPayloadHash(raw + " "));
    expect(qboRawPayloadHash(raw)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("handleQuickbooksWebhook", () => {
  it("records a durable receipt per subscribed entity and ACKs fast (200)", async () => {
    const d = deps();
    const response = await handleQuickbooksWebhook(await signedPost(LEGACY_PAYLOAD), d);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);
    expect(body.acknowledged).toBe(2);
    expect(body.ignored).toEqual([]);
    expect(d.receipts).toHaveLength(2);
    expect(d.receipts[0]).toMatchObject({
      capabilityId: "quickbooks-monitor-invoice-created",
      entity: "Invoice",
      operation: "Create",
      realmId: "123145876987654",
      id: "91",
      outcome: "received",
    });
    expect(d.receipts[0].eventId).toBe("qbo:123145876987654:Invoice:91:Create");
    expect(d.receipts[0].rawPayloadHash).toBe(qboRawPayloadHash(JSON.stringify(LEGACY_PAYLOAD)));
    expect(d.receipts[1].capabilityId).toBe("quickbooks-monitor-customer-created");
    expect(d.receipts[1].id).toBe("55");
    // both receipts share the SAME raw payload hash (one delivery, two events)
    expect(d.receipts[1].rawPayloadHash).toBe(d.receipts[0].rawPayloadHash);
  });
  it("ACKs the empty validation probe with 200 and records nothing", async () => {
    const d = deps();
    const response = await handleQuickbooksWebhook(await signedPost({ eventNotifications: [] }), d);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.acknowledged).toBe(0);
    expect(d.receipts).toHaveLength(0);
  });
  it("ignores unknown entities/operations (acknowledged, never recorded)", async () => {
    const d = deps();
    const response = await handleQuickbooksWebhook(
      await signedPost({
        eventNotifications: [
          {
            realmId: "123",
            dataChangeEvent: {
              entities: [
                { name: "Vendor", id: "1", operation: "Create" },
                { name: "Invoice", id: "9", operation: "Update" },
              ],
            },
          },
        ],
      }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.acknowledged).toBe(0);
    expect(body.ignored).toEqual(["Vendor.Create", "Invoice.Update"]);
    expect(d.receipts).toHaveLength(0);
  });
  it("skips an entity without a known id (non-destruction: never guess an id)", async () => {
    const d = deps();
    const response = await handleQuickbooksWebhook(
      await signedPost({
        eventNotifications: [
          {
            realmId: "123",
            dataChangeEvent: { entities: [{ name: "Invoice", operation: "Create" }] },
          },
        ],
      }),
      d,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.acknowledged).toBe(0);
    expect(body.ignored).toEqual(["Invoice.Create(no-id)"]);
    expect(d.receipts).toHaveLength(0);
  });
  it("rejects a wrong signature with 401 and records nothing", async () => {
    const d = deps();
    const response = await handleQuickbooksWebhook(await signedPost(LEGACY_PAYLOAD, { token: "c2lnLWJ1dC13cm9uZw==" }), d);
    expect(response.status).toBe(401);
    expect(d.receipts).toHaveLength(0);
  });
  it("rejects a missing signature header with 401 and records nothing", async () => {
    const d = deps();
    const response = await handleQuickbooksWebhook(
      new Request("https://example.test/api/webhooks/quickbooks", { method: "POST", body: JSON.stringify(LEGACY_PAYLOAD) }),
      d,
    );
    expect(response.status).toBe(401);
    expect(d.receipts).toHaveLength(0);
  });
  it("fails closed with 401 when the verifier token env is unset (never a guessed token)", async () => {
    const d = deps({ getVerifierToken: () => undefined });
    const response = await handleQuickbooksWebhook(await signedPost(LEGACY_PAYLOAD), d);
    expect(response.status).toBe(401);
    expect(d.receipts).toHaveLength(0);
  });
  it("rejects malformed JSON with 400 even with a VALID signature", async () => {
    const d = deps();
    const rawBody = "not-json";
    const sig = await computeQboWebhookSignature(rawBody, VERIFIER);
    const response = await handleQuickbooksWebhook(
      new Request("https://example.test/api/webhooks/quickbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json", [QBO_SIGNATURE_HEADER]: sig },
        body: rawBody,
      }),
      d,
    );
    expect(response.status).toBe(400);
    expect(d.receipts).toHaveLength(0);
  });
  it("rejects non-POST methods with 405 (never the SPA HTML fallback)", async () => {
    const d = deps();
    const get = await handleQuickbooksWebhook(new Request("https://example.test/api/webhooks/quickbooks", { method: "GET" }), d);
    expect(get.status).toBe(405);
    const put = await handleQuickbooksWebhook(
      new Request("https://example.test/api/webhooks/quickbooks", { method: "PUT", body: "{}" }),
      d,
    );
    expect(put.status).toBe(405);
    expect(d.receipts).toHaveLength(0);
  });
});

describe("live-receipt log (durability)", () => {
  it("persists receipts to disk, bounds the log, and latestQboWebhookReceipt returns the newest within TTL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qbo-webhook-test-"));
    try {
      await recordQboWebhookReceipt(
        {
          capabilityId: "quickbooks-monitor-invoice-created",
          eventId: "e1",
          entity: "Invoice",
          operation: "Create",
          realmId: "123",
          id: "91",
          rawPayloadHash: "h1",
          outcome: "received",
          receivedAt: new Date(Date.now() - 60_000).toISOString(),
        },
        dir,
      );
      await recordQboWebhookReceipt(
        {
          capabilityId: "quickbooks-monitor-invoice-created",
          eventId: "e2",
          entity: "Invoice",
          operation: "Create",
          realmId: "123",
          id: "92",
          rawPayloadHash: "h2",
          outcome: "received",
          receivedAt: new Date().toISOString(),
        },
        dir,
      );
      const file = join(dir, QBO_RECEIPTS_FILE);
      const onDisk = readQboWebhookReceipts(dir);
      expect(onDisk).toHaveLength(2);
      expect(onDisk[1].eventId).toBe("e2");
      const latest = latestQboWebhookReceipt("quickbooks-monitor-invoice-created", dir, 24 * 60 * 60 * 1000);
      expect(latest?.eventId).toBe("e2");
      expect(latestQboWebhookReceipt("quickbooks-monitor-customer-created", dir, 24 * 60 * 60 * 1000)).toBeUndefined();
      // stale receipts fall out of the TTL window
      const staleDir = mkdtempSync(join(tmpdir(), "qbo-webhook-stale-"));
      await recordQboWebhookReceipt(
        {
          capabilityId: "quickbooks-monitor-invoice-created",
          eventId: "old",
          entity: "Invoice",
          operation: "Create",
          realmId: "123",
          id: "99",
          rawPayloadHash: "h3",
          outcome: "received",
          receivedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
        staleDir,
      );
      expect(latestQboWebhookReceipt("quickbooks-monitor-invoice-created", staleDir, 24 * 60 * 60 * 1000)).toBeUndefined();
      rmSync(staleDir, { recursive: true, force: true });
      expect(existsSync(file)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
