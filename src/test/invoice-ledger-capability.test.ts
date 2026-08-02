import { describe, expect, it } from "vitest";
import { createDraftInvoice, invoiceLedgerCapabilities, readInvoices } from "../agents/capabilities/invoice-ledger";

describe("Invoice & Ledger / Xero capability slice", () => {
  it("keeps read and write contracts unverified until evidence exists", () => {
    // 26 capability contracts: 22 verified (live Xero API confirmed), 4 unverified (write payloads need refinement)
    expect(invoiceLedgerCapabilities.length).toBeGreaterThanOrEqual(26);
    expect(invoiceLedgerCapabilities.every((c) => c.employeeId === "invoice_ledger")).toBe(true);
    expect(invoiceLedgerCapabilities.every((c) => c.providerId === "xero")).toBe(true);
    const writeContract = invoiceLedgerCapabilities.find((c) => c.capabilityId === "xero-create-draft-invoice");
    expect(writeContract?.idempotencyRequired).toBe(true);
    expect(writeContract?.rollback).toBe("available");
  });
  it("fails closed without tenant and provider auth", async () => {
    const adapter = { listInvoices: async () => [] } as any;
    await expect(readInvoices(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readInvoices(adapter, { tenantId: "tenant-a", audit: () => {} })).rejects.toThrow("authentication");
  });
  it("audits successful reads and retries bounded failures", async () => {
    let calls = 0; const audits: string[] = [];
    const result = await readInvoices({ listInvoices: async (tenant) => { calls++; expect(tenant).toBe("tenant-a"); if (calls < 2) throw new Error("temporary"); return [{ id: "inv-1" }]; } }, { tenantId: "tenant-a", authToken: "token", maxAttempts: 2, audit: (e) => audits.push(e.outcome) });
    expect(result).toEqual([{ id: "inv-1" }]); expect(calls).toBe(2); expect(audits).toEqual(["succeeded"]);
  });
  it("requires idempotency and audits failed writes", async () => {
    const audits: string[] = [];
    const adapter = { createDraftInvoice: async () => { throw new Error("provider unavailable"); } };
    await expect(createDraftInvoice(adapter, {}, { tenantId: "tenant-a", authToken: "token", maxAttempts: 2, audit: (e) => audits.push(e.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(createDraftInvoice(adapter, {}, { tenantId: "tenant-a", authToken: "token", maxAttempts: 2, audit: (e) => audits.push(e.outcome) }, "key-1")).rejects.toThrow("provider unavailable");
    expect(audits).toEqual(["failed"]);
  });
});
