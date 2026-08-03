import { describe, expect, it, vi, beforeEach } from "vitest";
import { coupaAdapter } from "../verification/adapters/priority";
import type { AdapterContext } from "../verification/adapters";

function jsonResponse(data: unknown, status = 200) {
  return { ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => data } as unknown as Response;
}
/** Recorded Coupa API calls (method + url + parsed body). */
const calls: Array<{ method: string; url: string; body?: any }> = [];
function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    credentials: { apiKey: "key-1", instance: "demo" },
    allowWrites: true,
    ...overrides,
  } as AdapterContext;
}
const contract = (capabilityId: string) => ({ capabilityId } as never);
function installFetch(handler: (method: string, url: string, body?: any) => Response) {
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url);
    const method = (init?.method || "GET") as string;
    let body: any;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = String(init.body);
      }
    }
    calls.push({ method, url: u, body });
    return handler(method, u, body);
  }) as unknown as typeof fetch;
}
const defaultRoutes = (method: string, url: string) => {
  if (method === "GET" && url.includes("/purchase_orders") && !url.includes("/purchase_orders/")) return jsonResponse([{ id: "po1" }, { id: "po2" }]);
  if (method === "GET" && url.includes("/suppliers")) return jsonResponse([{ id: "s1" }, { id: "s2" }]);
  if (method === "GET" && url.includes("/receipts")) return jsonResponse([{ id: "r1" }]);
  if (method === "GET" && url.includes("/invoices")) return jsonResponse([{ id: "i1" }]);
  if (method === "GET" && url.includes("/approvals")) return jsonResponse([{ id: "a1" }]);
  if (method === "POST" && url.includes("/purchase_orders")) return jsonResponse({ id: "po-new" }, 201);
  return jsonResponse({});
};

describe("Coupa verification adapter (real client, mocked transport)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch(defaultRoutes);
  });

  it("read contracts return counts", async () => {
    const pos = await coupaAdapter(contract("coupa-read-purchase-orders"), ctx());
    expect(pos).toEqual({ httpStatus: 200, response: { count: 2 } });
    const suppliers = await coupaAdapter(contract("coupa-read-suppliers"), ctx());
    expect(suppliers.response).toEqual({ count: 2 });
    const receipts = await coupaAdapter(contract("coupa-read-receipts"), ctx());
    expect(receipts.response).toEqual({ count: 1 });
    const invoices = await coupaAdapter(contract("coupa-read-invoices-against-po"), ctx());
    expect(invoices.response).toEqual({ count: 1 });
    const approvals = await coupaAdapter(contract("coupa-read-approval-chains"), ctx());
    expect(approvals.response).toEqual({ count: 1 });
  });

  it("read hits canonical host", async () => {
    await coupaAdapter(contract("coupa-read-purchase-orders"), ctx());
    const poCall = calls.find((c) => c.url.includes("/purchase_orders"))!;
    expect(poCall.url).toContain("https://demo.coupahost.com/api");
  });

  it("write gate — fails without --writes and makes no network calls", async () => {
    calls.length = 0;
    await expect(coupaAdapter(contract("coupa-create-purchase-order"), ctx({ allowWrites: false }))).rejects.toThrow(/write verification disabled/);
    expect(calls).toHaveLength(0);
  });

  it("create-purchase-order creates a labeled PO", async () => {
    const r = await coupaAdapter(contract("coupa-create-purchase-order"), ctx());
    expect(r).toEqual({ httpStatus: 201, response: { created: true, poId: "po-new" } });
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/purchase_orders"))!;
    expect(post.body.description).toMatch(/Phase7-VERIFY/);
    expect(post.body.supplier).toBeDefined();
    expect(post.body.lines).toBeDefined();
  });

  it("fails closed without an api key or instance", async () => {
    calls.length = 0;
    await expect(coupaAdapter(contract("coupa-read-purchase-orders"), ctx({ credentials: {} }))).rejects.toThrow(/no apiKey/);
    expect(calls).toHaveLength(0);
    await expect(coupaAdapter(contract("coupa-read-purchase-orders"), ctx({ credentials: { apiKey: "key-1" } }))).rejects.toThrow(/no instance/);
    expect(calls).toHaveLength(0);
  });

  it("unknown capability ids fail closed without network calls", async () => {
    calls.length = 0;
    await expect(coupaAdapter(contract("coupa-make-coffee"), ctx())).rejects.toThrow(/no verification path/);
    expect(calls).toHaveLength(0);
  });
});
