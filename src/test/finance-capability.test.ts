import { describe, expect, it } from "vitest";
import { financeCapabilities, readTransactions, createInvoice, readChartOfAccounts, readCustomers, createCustomer, monitorTransactions } from "../agents/capabilities/finance";

describe("Finance / QuickBooks Online capability slice", () => {
  it("has 10 unverified contracts", () => {
    expect(financeCapabilities).toHaveLength(10);
    expect(financeCapabilities.map((c) => c.status)).toEqual(Array(10).fill("unverified"));
  });
  it("has correct provider id", () => {
    expect(financeCapabilities.every((c) => c.providerId === "quickbooks-online")).toBe(true);
  });
  it("has correct capability ids", () => {
    const ids = financeCapabilities.map((c) => c.capabilityId).sort();
    expect(ids).toEqual([
      "quickbooks-create-customer",
      "quickbooks-create-invoice",
      "quickbooks-monitor-transactions",
      "quickbooks-read-balance-sheet",
      "quickbooks-read-bills",
      "quickbooks-read-chart-of-accounts",
      "quickbooks-read-customers",
      "quickbooks-read-profit-loss",
      "quickbooks-read-transactions",
      "quickbooks-reconcile-bank-feed",
    ]);
  });
  it("has contract kinds: 6 understand, 3 automate, 1 monitor", () => {
    const kinds = financeCapabilities.reduce((acc, c) => { acc[c.kind] = (acc[c.kind] || 0) + 1; return acc; }, {} as Record<string, number>);
    expect(kinds.understand).toBe(6);
    expect(kinds.automate).toBe(3);
    expect(kinds.monitor).toBe(1);
  });
  it("fails closed without tenant or auth for readTransactions", async () => {
    const adapter = { readTransactions: async () => [] } as any;
    await expect(readTransactions(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readTransactions(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });
  it("retries bounded reads and audits for readTransactions", async () => {
    let calls = 0; const outcomes: string[] = [];
    const result = await readTransactions({ readTransactions: async (tenantId) => { calls++; expect(tenantId).toBe("t"); if (calls < 2) throw Error("temporary"); return ["tx"]; } }, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) });
    expect(result).toEqual(["tx"]); expect(calls).toBe(2); expect(outcomes).toEqual(["succeeded"]);
  });
  it("requires idempotency and audits failed writes for createInvoice", async () => {
    const outcomes: string[] = []; const adapter = { createInvoice: async () => { throw Error("unavailable"); } };
    await expect(createInvoice(adapter, {}, { tenantId: "t", authToken: "token", audit: (event) => outcomes.push(event.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(createInvoice(adapter, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(outcomes).toEqual(["failed"]);
  });
  it("readChartOfAccounts succeeds with valid adapter", async () => {
    const result = await readChartOfAccounts({ readChartOfAccounts: async () => ["acct1", "acct2"] }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(result).toEqual(["acct1", "acct2"]);
  });
  it("readCustomers succeeds with valid adapter", async () => {
    const result = await readCustomers({ readCustomers: async () => ["cust1"] }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(result).toEqual(["cust1"]);
  });
  it("createCustomer requires idempotency", async () => {
    const adapter = { createCustomer: async () => ({ id: "c1" }) };
    await expect(createCustomer(adapter, { DisplayName: "Test" }, { tenantId: "t", authToken: "token", audit: () => {} }, "")).rejects.toThrow("Idempotency");
    const result = await createCustomer(adapter, { DisplayName: "Test" }, { tenantId: "t", authToken: "token", audit: () => {} }, "ik1");
    expect(result).toEqual({ id: "c1" });
  });
  it("monitorTransactions succeeds with valid adapter", async () => {
    const result = await monitorTransactions({ monitorTransactions: async () => ({ recent: 5 }) }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(result).toEqual({ recent: 5 });
  });
});
