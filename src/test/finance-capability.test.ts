import { describe, expect, it } from "vitest";
import { financeCapabilities, readTransactions, createInvoice } from "../agents/capabilities/finance";

describe("Finance / QuickBooks capability slice", () => {
  it("keeps contracts unverified", () => expect(financeCapabilities.map((c) => c.status)).toEqual(["unverified", "unverified"]));
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
