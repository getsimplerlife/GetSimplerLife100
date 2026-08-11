import { describe, expect, it } from "vitest";
import {
  procurementCapabilities,
  procurementCapabilitiesExtended,
  readPurchaseOrders,
  createPurchaseOrder,
  monitorPurchaseOrders,
  executeProcurementCapability,
  executeExtendedCapability,
  procurementReadCapabilityIds,
  procurementWriteCapabilityIds,
} from "../agents/capabilities/procurement";

const allContracts = [...procurementCapabilities, ...procurementCapabilitiesExtended];

describe("Procurement / Coupa capability slice", () => {
  it("keeps all contracts unverified (code-complete, not yet tenant-verified)", () => {
    expect(allContracts.map((c) => c.status)).toEqual(Array(allContracts.length).fill("unverified"));
  });

  it("covers understand, monitor, and automate kinds with coupa- prefixed ids", () => {
    expect(allContracts.length).toBe(7);
    const ids = allContracts.map((c) => c.capabilityId);
    expect(ids).toContain("coupa-read-purchase-orders");
    expect(ids).toContain("coupa-create-purchase-order");
    expect(ids).toContain("coupa-monitor-purchase-orders");
    expect(ids).toContain("coupa-read-suppliers");
    expect(ids).toContain("coupa-read-receipts");
    expect(ids).toContain("coupa-read-invoices-against-po");
    expect(ids).toContain("coupa-read-approval-chains");
    const kinds = allContracts.map((c) => c.kind);
    expect(kinds.filter((k) => k === "understand")).toHaveLength(5);
    expect(kinds.filter((k) => k === "monitor")).toHaveLength(1);
    expect(kinds.filter((k) => k === "automate")).toHaveLength(1);
  });

  it("declares the write surface as idempotency-required", () => {
    const write = allContracts.find((c) => c.capabilityId === "coupa-create-purchase-order")!;
    expect(write.kind).toBe("automate");
    expect(write.idempotencyRequired).toBe(true);
    expect(write.retryPolicy).toBe("bounded");
    expect(write.rollback).not.toBe("not_applicable");
  });

  it("has monitor contract with correct capabilityId", () => {
    const m = procurementCapabilities.find((c) => c.capabilityId === "coupa-monitor-purchase-orders");
    expect(m).toBeDefined();
    expect(m!.kind).toBe("monitor");
  });

  it("fails closed without tenant or auth", async () => {
    const a = { listPurchaseOrders: async () => [] } as any;
    await expect(readPurchaseOrders(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readPurchaseOrders(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("retries bounded reads and audits", async () => {
    let calls = 0;
    const out: string[] = [];
    const r = await readPurchaseOrders(
      {
        listPurchaseOrders: async (t: string) => {
          calls++;
          expect(t).toBe("t");
          if (calls < 2) throw Error("temporary");
          return ["po"];
        },
      },
      { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) },
    );
    expect(r).toEqual(["po"]);
    expect(calls).toBe(2);
    expect(out).toEqual(["succeeded"]);
  });

  it("requires idempotency and audits failed writes", async () => {
    const out: string[] = [];
    const a = { createPurchaseOrder: async () => { throw Error("unavailable"); } };
    await expect(createPurchaseOrder(a, {}, { tenantId: "t", authToken: "token", audit: (e) => out.push(e.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(createPurchaseOrder(a, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(out).toEqual(["failed"]);
  });

  it("monitor fails closed without tenant or auth", async () => {
    const a = { monitorPurchaseOrders: async () => [] } as any;
    await expect(monitorPurchaseOrders(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(monitorPurchaseOrders(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("monitor retries and audits on success", async () => {
    let calls = 0;
    const out: string[] = [];
    const r = await monitorPurchaseOrders(
      {
        monitorPurchaseOrders: async (t: string) => {
          calls++;
          expect(t).toBe("t");
          if (calls < 2) throw Error("temporary");
          return [{ id: "po1" }, { id: "po2" }];
        },
      },
      { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) },
    );
    expect(r).toEqual([{ id: "po1" }, { id: "po2" }]);
    expect(calls).toBe(2);
    expect(out).toEqual(["succeeded"]);
  });

  it("monitor audits failure after all retries", async () => {
    const out: string[] = [];
    const a = { monitorPurchaseOrders: async () => { throw Error("unavailable"); } };
    await expect(monitorPurchaseOrders(a, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) })).rejects.toThrow("unavailable");
    expect(out).toEqual(["failed"]);
  });

  /* ── Extended (typed dispatcher) surface ── */

  it("extended reads retry and audit through the typed dispatcher", async () => {
    let calls = 0;
    const out: string[] = [];
    const adapter = {
      readSuppliers: async (tenantId: string) => {
        calls++;
        expect(tenantId).toBe("t");
        if (calls < 2) throw Error("temporary");
        return ["supplier"];
      },
    } as any;
    const r = await executeProcurementCapability(adapter, "coupa-read-suppliers", {
      tenantId: "t",
      authToken: "token",
      maxAttempts: 2,
      audit: (e) => out.push(e.outcome),
    });
    expect(r).toEqual(["supplier"]);
    expect(calls).toBe(2);
    expect(out).toEqual(["succeeded"]);
  });

  it("extended dispatcher maps every read capability to a method", async () => {
    for (const capabilityId of procurementReadCapabilityIds) {
      const method = capabilityId.replace(/^coupa-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const adapter = { [method]: async () => "ok" } as any;
      const r = await executeProcurementCapability(adapter, capabilityId, {
        tenantId: "t",
        authToken: "token",
        audit: () => {},
      });
      expect(r).toBe("ok");
    }
  });

  it("extended dispatcher fails closed for unknown capability ids", async () => {
    await expect(
      executeProcurementCapability({} as any, "coupa-make-coffee", { tenantId: "t", authToken: "token", audit: () => {} }),
    ).rejects.toThrow("Unsupported capability");
  });

  it("extended dispatcher audits failure after all retries", async () => {
    const out: string[] = [];
    const adapter = { readReceipts: async () => { throw Error("unavailable"); } } as any;
    await expect(
      executeProcurementCapability(adapter, "coupa-read-receipts", {
        tenantId: "t",
        authToken: "token",
        maxAttempts: 2,
        audit: (e) => out.push(e.outcome),
      }),
    ).rejects.toThrow("unavailable");
    expect(out).toEqual(["failed"]);
  });

  it("executeExtendedCapability delegates to the typed dispatcher", async () => {
    const adapter = { readApprovalChains: async () => ["chain"] } as any;
    const r = await executeExtendedCapability(adapter, "coupa-read-approval-chains", {
      tenantId: "t",
      authToken: "token",
      audit: () => {},
    });
    expect(r).toEqual(["chain"]);
  });

  it("write set is empty for the extended surface (all extended contracts are reads)", () => {
    expect(procurementWriteCapabilityIds).toEqual([]);
    // Every extended contract id is a declared read
    for (const c of procurementCapabilitiesExtended) {
      expect(procurementReadCapabilityIds).toContain(c.capabilityId);
    }
  });
});
