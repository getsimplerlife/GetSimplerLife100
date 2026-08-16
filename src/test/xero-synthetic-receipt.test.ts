/**
 * PR #167 — synthetic webhook receipt rejection in the monitor-verification path.
 *
 * The Xero webhook receiver records a durable receipt for EVERY processed event,
 * including our own signed verification POSTs which carry synthetic resource ids
 * ("abc123", all-zeros UUID, or non-UUID tokens). The batch verification CLI must
 * only count a monitor contract as verified when the newest matching receipt
 * carries a plausible REAL Xero resource UUID (v4 format).
 *
 * These tests drive the hardened selector (`latestRealXeroWebhookReceipt` +
 * `isSyntheticXeroResourceToken`) and the xeroAdapter monitor path directly —
 * no live contact, temp DATA_DIR only.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { xeroAdapter, isSyntheticXeroResourceToken, latestRealXeroWebhookReceipt, xeroResourceTokenFromEventId } from "../verification/adapters/xero";
import { recordXeroWebhookReceipt, type XeroWebhookReceipt } from "../monitoring/xero-webhook";
import type { AdapterContext } from "../verification/adapters";
import type { ProviderCredential } from "../verification/credential-source";

const REAL_UUID = "3b26094e-5284-45ee-839e-6b0efe4a5b80";
const ALL_ZEROS_UUID = "00000000-0000-0000-0000-000000000000";
const TENANT = "b6db9fd6-ce86-41e2-98ab-d52be61d1b04";
const TTL = 24 * 60 * 60 * 1000;

function receipt(capabilityId: string, resourceToken: string, overrides: Partial<XeroWebhookReceipt> = {}): XeroWebhookReceipt {
  return {
    capabilityId,
    eventId: `xero:${TENANT}:${overrides.eventType ?? "INVOICE.CREATED"}:${resourceToken}`,
    eventType: overrides.eventType ?? "INVOICE.CREATED",
    tenantId: TENANT,
    outcome: "processed",
    receivedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCred(overrides: Partial<ProviderCredential> = {}): ProviderCredential {
  return {
    accessToken: "tok",
    refreshToken: "rt",
    // vitest note: OAuth expiresAt is in SECONDS (not ms) — future = no refresh.
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    tenantId: TENANT,
    ...overrides,
  } as ProviderCredential;
}

function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return { credentials: makeCred(), allowWrites: false, ...overrides } as AdapterContext;
}

const contract = (capabilityId: string) => ({ capabilityId } as never);

describe("xeroResourceTokenFromEventId", () => {
  it("extracts the resource token from a receipt eventId", () => {
    expect(xeroResourceTokenFromEventId(`xero:${TENANT}:INVOICE.CREATED:${REAL_UUID}`)).toBe(REAL_UUID);
    expect(xeroResourceTokenFromEventId(`xero:${TENANT}:BILL.CREATED:abc123`)).toBe("abc123");
  });
  it("returns empty for malformed event ids", () => {
    expect(xeroResourceTokenFromEventId("not-an-event-id")).toBe("");
    expect(xeroResourceTokenFromEventId("")).toBe("");
  });
});

describe("isSyntheticXeroResourceToken", () => {
  it("rejects abc123 tokens", () => {
    expect(isSyntheticXeroResourceToken("abc123")).toBe(true);
    expect(isSyntheticXeroResourceToken("invoice-abc123")).toBe(true);
  });
  it("rejects the all-zeros UUID", () => {
    expect(isSyntheticXeroResourceToken(ALL_ZEROS_UUID)).toBe(true);
  });
  it("rejects non-UUID tokens and empty tokens", () => {
    expect(isSyntheticXeroResourceToken("inv-live-1")).toBe(true);
    expect(isSyntheticXeroResourceToken("no-resource")).toBe(true);
    expect(isSyntheticXeroResourceToken("")).toBe(true);
    expect(isSyntheticXeroResourceToken("   ")).toBe(true);
  });
  it("accepts a plausible real Xero resource UUID (v4)", () => {
    expect(isSyntheticXeroResourceToken(REAL_UUID)).toBe(false);
  });
});

describe("latestRealXeroWebhookReceipt", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "xero-synth-receipt-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the newest REAL receipt, skipping synthetic ones", async () => {
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", "abc123"), dir);
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", ALL_ZEROS_UUID), dir);
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", REAL_UUID), dir);
    const latest = latestRealXeroWebhookReceipt("xero-monitor-invoice-created", dir, TTL);
    expect(latest?.eventId).toContain(REAL_UUID);
  });

  it("returns undefined when ONLY synthetic receipts exist", async () => {
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", "abc123"), dir);
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", ALL_ZEROS_UUID), dir);
    expect(latestRealXeroWebhookReceipt("xero-monitor-invoice-created", dir, TTL)).toBeUndefined();
  });

  it("returns undefined when the only real receipt is stale (outside TTL)", async () => {
    await recordXeroWebhookReceipt(
      receipt("xero-monitor-invoice-created", REAL_UUID, { receivedAt: new Date(Date.now() - 2 * TTL).toISOString() }),
      dir,
    );
    expect(latestRealXeroWebhookReceipt("xero-monitor-invoice-created", dir, TTL)).toBeUndefined();
  });

  it("picks the newest real receipt even when a newer synthetic one exists", async () => {
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", REAL_UUID, { receivedAt: new Date(Date.now() - 60_000).toISOString() }), dir);
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", "abc123", { receivedAt: new Date().toISOString() }), dir);
    const latest = latestRealXeroWebhookReceipt("xero-monitor-invoice-created", dir, TTL);
    expect(latest?.eventId).toContain(REAL_UUID);
  });

  it("does not match other capabilities", async () => {
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", REAL_UUID), dir);
    expect(latestRealXeroWebhookReceipt("xero-monitor-bill-created", dir, TTL)).toBeUndefined();
  });
});

describe("xeroAdapter monitor path — synthetic receipt rejection (PR #167)", () => {
  let dir: string;
  let prevDataDir: string | undefined;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "xero-adapter-synth-"));
    prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
  });
  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails closed (throws) when only synthetic receipts exist", async () => {
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", "abc123"), dir);
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", ALL_ZEROS_UUID), dir);
    await expect(xeroAdapter(contract("xero-monitor-invoice-created"), ctx())).rejects.toThrow(
      /live webhook receipt.*REAL Xero resource UUID/,
    );
  });

  it("fails closed (throws) when NO receipt exists", async () => {
    await expect(xeroAdapter(contract("xero-monitor-invoice-created"), ctx())).rejects.toThrow(/live webhook receipt/);
  });

  it("verifies the monitor contract when a real-UUID receipt exists", async () => {
    await recordXeroWebhookReceipt(receipt("xero-monitor-invoice-created", REAL_UUID), dir);
    const out = await xeroAdapter(contract("xero-monitor-invoice-created"), ctx());
    expect(out.response).toMatchObject({
      verified: true,
      source: "live-webhook-receipt",
      eventType: "INVOICE.CREATED",
      resourceId: REAL_UUID,
      tenantId: TENANT,
    });
  });

  it("verifies BILL.CREATED only via a real-UUID receipt", async () => {
    await recordXeroWebhookReceipt(receipt("xero-monitor-bill-created", "abc123", { eventType: "BILL.CREATED" }), dir);
    await expect(xeroAdapter(contract("xero-monitor-bill-created"), ctx())).rejects.toThrow(/REAL Xero resource UUID/);
    await recordXeroWebhookReceipt(receipt("xero-monitor-bill-created", REAL_UUID, { eventType: "BILL.CREATED" }), dir);
    const out = await xeroAdapter(contract("xero-monitor-bill-created"), ctx());
    expect(out.response).toMatchObject({ verified: true, source: "live-webhook-receipt", eventType: "BILL.CREATED", resourceId: REAL_UUID });
  });
});
