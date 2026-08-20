import { describe, expect, it } from "vitest";
import { financeCapabilities, readTransactions, createInvoice } from "../agents/capabilities/finance";

describe("Finance / QuickBooks capability slice", () => {
  it("keeps contracts unverified", () =>
    expect(financeCapabilities.map((c) => c.status)).toEqual(Array(financeCapabilities.length).fill("unverified")));
  it("exposes quote-to-cash QBO contracts read, write and monitor", () => {
    const ids = financeCapabilities.map((c) => c.capabilityId);
    expect(ids).toEqual(
      expect.arrayContaining(["quickbooks-read-transactions", "quickbooks-create-invoice", "quickbooks-read-invoices", "quickbooks-read-customers", "quickbooks-create-estimate", "quickbooks-create-customer", "quickbooks-monitor-invoice-created", "quickbooks-monitor-customer-created"]),
    );
    expect(financeCapabilities.length).toBe(8);
  });
  it("fails closed without tenant or auth", async () => {
    const adapter = { listTransactions: async () => [] } as any;
    await expect(readTransactions(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readTransactions(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });
  it("retries bounded reads and audits", async () => {
    let calls = 0; const outcomes: string[] = [];
    const result = await readTransactions({ listTransactions: async (tenantId) => { calls++; expect(tenantId).toBe("t"); if (calls < 2) throw Error("temporary"); return ["transaction"]; } }, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) });
    expect(result).toEqual(["transaction"]); expect(calls).toBe(2); expect(outcomes).toEqual(["succeeded"]);
  });
  it("requires idempotency and audits failed writes", async () => {
    const outcomes: string[] = []; const adapter = { createInvoice: async () => { throw Error("unavailable"); } };
    await expect(createInvoice(adapter, {}, { tenantId: "t", authToken: "token", audit: (event) => outcomes.push(event.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(createInvoice(adapter, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(outcomes).toEqual(["failed"]);
  });
});
