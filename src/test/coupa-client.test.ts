import { describe, expect, it } from "vitest";
import { createCoupaClient } from "../integrations/providers/coupa/client";

function makeClient() {
  return createCoupaClient({ apiKey: "key-1", instance: "demo" } as never);
}

describe("Coupa client full capability surface", () => {
  it("uses X-API-KEY header and canonical host", () => {
    const c = makeClient();
    const headers = (c as any).headers;
    expect(headers["X-API-KEY"]).toBe("key-1");
    expect(headers["Content-Type"]).toBe("application/json");
    expect((c as any).client.baseUrl).toBe("https://demo.coupahost.com/api");
  });

  it("hits the canonical host for read methods", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: [{ id: "po1" }, { id: "po2" }] };
    };
    const pos = await c.listPurchaseOrders();
    expect(calls).toContain("/purchase_orders");
    expect(pos).toHaveLength(2);
    await c.getPurchaseOrder("po1");
    expect(calls).toContain("/purchase_orders/po1");
    await c.listSuppliers();
    expect(calls).toContain("/suppliers");
    await c.listReceipts();
    expect(calls).toContain("/receipts");
    await c.listInvoices();
    expect(calls).toContain("/invoices");
    await c.listApprovals();
    expect(calls).toContain("/approvals");
  });

  it("listPurchaseOrders supports query params", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: [{ id: "po1" }] };
    };
    await c.listPurchaseOrders({ "updated-at[gt]": "2024-01-01" });
    expect(calls[0]).toContain("?updated-at%5Bgt%5D=2024-01-01");
  });

  it("unwrapList handles wrapped responses", async () => {
    const c = makeClient();
    (c as any).client.get = async () => ({ data: { purchase_orders: [{ id: "po1" }] } });
    const pos = await c.listPurchaseOrders();
    expect(pos).toEqual([{ id: "po1" }]);
    // Also handles bare arrays
    (c as any).client.get = async () => ({ data: [{ id: "po2" }] });
    const pos2 = await c.listPurchaseOrders();
    expect(pos2).toEqual([{ id: "po2" }]);
  });

  it("listPurchaseOrdersChangedSince passes the ISO timestamp as a query param", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: [{ id: "po1" }] };
    };
    await c.listPurchaseOrdersChangedSince("2024-01-01T00:00:00Z");
    expect(calls[0]).toContain("updated-at%5Bgt%5D=2024-01-01T00%3A00%3A00Z");
  });

  it("posts create/update payloads to the right paths", async () => {
    const c = makeClient();
    const calls: Array<{ method: string; path: string; body: string }> = [];
    (c as any).client.post = async (path: string, body: string) => {
      calls.push({ method: "post", path, body });
      return { data: { id: "po-new" } };
    };
    (c as any).client.put = async (path: string, body: string) => {
      calls.push({ method: "put", path, body });
      return { data: { id: "po-new", state: "issued" } };
    };
    await c.createPurchaseOrder({ description: "Test PO", currency: { code: "USD" } });
    const post = calls.find((x) => x.method === "post")!;
    expect(post.path).toBe("/purchase_orders");
    expect(JSON.parse(post.body).description).toBe("Test PO");
    await c.updatePurchaseOrder("po1", { state: "issued" });
    const put = calls.find((x) => x.method === "put")!;
    expect(put.path).toBe("/purchase_orders/po1");
    expect(JSON.parse(put.body).state).toBe("issued");
  });

  it("healthCheck returns false instead of throwing", async () => {
    const c = makeClient();
    (c as any).client.get = async () => {
      throw new Error("down");
    };
    expect(await c.healthCheck()).toBe(false);
    (c as any).client.get = async () => ({ ok: true });
    expect(await c.healthCheck()).toBe(true);
  });

  it("createCoupaClient fails closed without credentials", () => {
    expect(() => createCoupaClient({} as never)).toThrow(/no apiKey/);
    expect(() => createCoupaClient({ apiKey: "key" } as never)).toThrow(/no instance/);
  });
});
