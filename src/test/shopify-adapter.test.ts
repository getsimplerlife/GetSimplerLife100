import { describe, expect, it, vi, beforeEach } from "vitest";
import { shopifyAdapter } from "../verification/adapters/priority";
import type { AdapterContext } from "../verification/adapters";

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
  } as unknown as Response;
}

const calls: Array<{ method: string; url: string; body?: any }> = [];

function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    credentials: { accessToken: "token-1", storeName: "test-store" },
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
  if (method === "GET" && url.includes("/orders.json")) {
    return jsonResponse({ orders: [{ id: 1, name: "#1001" }] });
  }
  if (method === "GET" && url.includes("/products.json")) {
    if (url.includes("limit=1")) {
      return jsonResponse({ products: [{ id: 10, title: "Existing Product", variants: [{ id: 99 }] }] });
    }
    return jsonResponse({ products: [{ id: 1 }, { id: 2 }] });
  }
  if (method === "GET" && url.includes("/customers.json")) {
    return jsonResponse({ customers: [{ id: 3 }] });
  }
  if (method === "GET" && url.includes("/locations.json")) {
    return jsonResponse({ locations: [{ id: 100 }] });
  }
  if (method === "GET" && url.includes("/inventory_levels.json")) {
    return jsonResponse({ inventory_levels: [{ inventory_item_id: 1 }, { inventory_item_id: 2 }] });
  }
  if (method === "GET" && url.includes("/variants.json")) {
    return jsonResponse({ variants: [{ id: 99 }] });
  }
  if (method === "GET" && url.includes("/fulfillments.json")) {
    return jsonResponse({ fulfillments: [{ id: 50 }] });
  }
  if (method === "POST" && url.endsWith("/products.json")) {
    return jsonResponse({ product: { id: 999 } }, 201);
  }
  if (method === "PUT" && url.includes("/products/")) {
    return jsonResponse({ product: { id: 10, title: "Updated" } });
  }
  if (method === "DELETE" && url.includes("/products/")) {
    return jsonResponse({}, 200);
  }
  if (method === "PUT" && url.includes("/fulfillments/")) {
    return jsonResponse({ fulfillment: { id: 50, tracking_company: "Phase7 test" } });
  }
  return jsonResponse({});
};

describe("Shopify verification adapter (real client, mocked transport)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch(defaultRoutes);
  });

  it("rejects missing credentials", async () => {
    await expect(
      shopifyAdapter(contract("shopify-read-orders"), {
        credentials: {},
        allowWrites: false,
      } as AdapterContext),
    ).rejects.toThrow("accessToken");

    await expect(
      shopifyAdapter(contract("shopify-read-orders"), {
        credentials: { accessToken: "tok" },
        allowWrites: false,
      } as AdapterContext),
    ).rejects.toThrow("storeName");
  });

  it("read orders returns count", async () => {
    const result = await shopifyAdapter(contract("shopify-read-orders"), ctx());
    expect(result).toEqual({ httpStatus: 200, response: { count: 1 } });
    expect(calls.some((c) => c.url.includes("test-store.myshopify.com"))).toBe(true);
  });

  it("read products returns count", async () => {
    const result = await shopifyAdapter(contract("shopify-read-products"), ctx());
    expect(result).toEqual({ httpStatus: 200, response: { count: 2 } });
  });

  it("read customers returns count", async () => {
    const result = await shopifyAdapter(contract("shopify-read-customers"), ctx());
    expect(result).toEqual({ httpStatus: 200, response: { count: 1 } });
  });

  it("read inventory returns count and locationId", async () => {
    const result = await shopifyAdapter(contract("shopify-read-inventory"), ctx());
    expect(result).toEqual({ httpStatus: 200, response: { count: 2, locationId: 100 } });
  });

  it("read product variants returns count and productId", async () => {
    const result = await shopifyAdapter(contract("shopify-read-product-variants"), ctx());
    expect(result).toEqual({ httpStatus: 200, response: { count: 1, productId: 10 } });
  });

  it("read fulfillments returns count and orderId", async () => {
    const result = await shopifyAdapter(contract("shopify-read-fulfillments"), ctx());
    expect(result).toEqual({ httpStatus: 200, response: { count: 1, orderId: 1 } });
  });

  it("create product fails closed without --writes", async () => {
    await expect(
      shopifyAdapter(contract("shopify-create-product"), {
        ...ctx(),
        allowWrites: false,
      }),
    ).rejects.toThrow("write verification disabled");
  });

  it("create product with writes enabled", async () => {
    const result = await shopifyAdapter(contract("shopify-create-product"), ctx({ allowWrites: true }));
    expect(result).toEqual({ httpStatus: 201, response: { created: true, rolledBack: true, productId: 999 } });
    // Should have POSTed product and DELETE'd it for rollback
    expect(calls.some((c) => c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("update product fails closed without --writes", async () => {
    await expect(
      shopifyAdapter(contract("shopify-update-product"), {
        ...ctx(),
        allowWrites: false,
      }),
    ).rejects.toThrow("write verification disabled");
  });

  it("update product with writes enabled", async () => {
    const result = await shopifyAdapter(contract("shopify-update-product"), ctx({ allowWrites: true }));
    expect(result).toEqual({ httpStatus: 200, response: { updated: true, productId: 10 } });
  });

  it("update fulfillment fails closed without --writes", async () => {
    await expect(
      shopifyAdapter(contract("shopify-update-fulfillment"), {
        ...ctx(),
        allowWrites: false,
      }),
    ).rejects.toThrow("write verification disabled");
  });

  it("update fulfillment with writes enabled", async () => {
    const result = await shopifyAdapter(contract("shopify-update-fulfillment"), ctx({ allowWrites: true }));
    expect(result).toEqual({ httpStatus: 200, response: { updated: true, orderId: 1, fulfillmentId: 50 } });
  });

  it("unknown capability fails closed", async () => {
    await expect(shopifyAdapter(contract("shopify-bogus"), ctx())).rejects.toThrow(
      "no verification path for shopify-bogus",
    );
  });

  it("all requests hit canonical myshopify.com host", async () => {
    await shopifyAdapter(contract("shopify-read-orders"), ctx());
    const shopifyCalls = calls.filter((c) => c.url.includes("test-store.myshopify.com"));
    expect(shopifyCalls.length).toBeGreaterThan(0);
    // Ensure no Google Drive URLs
    expect(calls.some((c) => c.url.includes("googleapis.com"))).toBe(false);
    expect(calls.some((c) => c.url.includes("drive"))).toBe(false);
  });
});
