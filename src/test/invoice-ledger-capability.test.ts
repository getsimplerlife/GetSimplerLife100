import { describe, expect, it } from "vitest";
import { createDraftInvoice, invoiceLedgerCapabilities, readInvoices } from "../agents/capabilities/invoice-ledger";

describe("Invoice & Ledger / Xero capability slice", () => {
  it("declares 26 contracts (18 read / 6 write / 2 monitor), all unverified until live evidence exists", () => {
    expect(invoiceLedgerCapabilities).toHaveLength(26);
    expect(invoiceLedgerCapabilities.map((c) => c.status)).toEqual(Array(26).fill("unverified"));
    const byKind = (kind: string) => invoiceLedgerCapabilities.filter((c) => c.kind === kind);
    expect(byKind("understand")).toHaveLength(18);
    expect(byKind("automate")).toHaveLength(6);
    expect(byKind("monitor")).toHaveLength(2);
    // every contract is tenant-scoped, authenticated, audited, and bounded
    for (const c of invoiceLedgerCapabilities) {
      expect(c.tenantScoped).toBe(true);
      expect(c.authRequired).toBe(true);
      expect(c.auditRequired).toBe(true);
      expect(c.retryPolicy).toBe("bounded");
    }
    // writes carry idempotency + rollback
    for (const c of byKind("automate")) {
      expect(c.idempotencyRequired).toBe(true);
      expect(c.rollback).not.toBe("not_applicable");
    }
    // the original write contract keeps its safety fields
    const draft = invoiceLedgerCapabilities.find((c) => c.capabilityId === "xero-create-draft-invoice")!;
    expect(draft.idempotencyRequired).toBe(true);
    expect(draft.rollback).toBe("available");
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
