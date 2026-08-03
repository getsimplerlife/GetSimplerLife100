import { describe, expect, it } from "vitest";
import { ShopifyClient, createShopifyClient } from "../integrations/providers/shopify/client";

function makeClient() {
  return new ShopifyClient("token-1", "my-store");
}

describe("Shopify client full capability surface", () => {
  it("constructor requires accessToken and storeName", () => {
    expect(() => new ShopifyClient("", "store")).toThrow("accessToken");
    expect(() => new ShopifyClient("token", "")).toThrow("storeName");
  });

  it("builds correct base URL and auth headers", () => {
    const c = makeClient();
    expect((c as any).accessToken).toBe("token-1");
    expect((c as any).storeName).toBe("my-store");
    expect((c as any).headers["X-Shopify-Access-Token"]).toBe("token-1");
    expect((c as any).headers["Content-Type"]).toBe("application/json");
  });

  it("hits canonical Shopify Admin API paths for read methods", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { products: [{ id: 1 }] }, ok: true };
    };
    (c as any).client.post = async (path: string) => {
      calls.push(path);
      return { data: { product: { id: 1 } }, ok: true };
    };
    (c as any).client.put = async (path: string) => {
      calls.push(path);
      return { data: { product: { id: 1 } }, ok: true };
    };
    (c as any).client.delete = async (path: string) => {
      calls.push(path);
      return { ok: true };
    };

    await c.listProducts();
    expect(calls).toContain("/products.json");

    await c.listProducts({ limit: 10, sinceId: 100 });
    expect(calls).toContain("/products.json?limit=10&since_id=100");

    await c.getProduct(123);
    expect(calls).toContain("/products/123.json");

    await c.getProductVariants(456);
    expect(calls).toContain("/products/456/variants.json");

    await c.createProduct({ title: "Test" });
    expect(calls).toContain("/products.json");

    await c.updateProduct(789, { title: "Updated" });
    expect(calls).toContain("/products/789.json");

    await c.deleteProduct(101);
    expect(calls).toContain("/products/101.json");
  });

  it("hits order and customer paths", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { orders: [{ id: 1 }], customers: [{ id: 2 }], fulfillments: [] }, ok: true };
    };

    await c.listOrders();
    expect(calls).toContain("/orders.json?status=any");

    await c.listOrders({ status: "open", limit: 5 });
    expect(calls).toContain("/orders.json?status=open&limit=5");

    await c.getOrder(55);
    expect(calls).toContain("/orders/55.json");

    await c.listCustomers();
    expect(calls).toContain("/customers.json");

    await c.listCustomers({ limit: 10 });
    expect(calls).toContain("/customers.json?limit=10");

    await c.getCustomer(42);
    expect(calls).toContain("/customers/42.json");
  });

  it("hits inventory, fulfillment, and location paths", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { inventory_levels: [], locations: [{ id: 1 }] }, ok: true };
    };

    await c.listInventoryLevels({ locationId: 1 });
    expect(calls).toContain("/inventory_levels.json?location_ids=1");

    await c.getInventoryLevel(100, 200);
    expect(calls).toContain("/inventory_levels.json?inventory_item_ids=100&location_ids=200");

    await c.listFulfillments(10);
    expect(calls).toContain("/orders/10/fulfillments.json");

    await c.getFulfillment(10, 5);
    expect(calls).toContain("/orders/10/fulfillments/5.json");

    await c.listLocations();
    expect(calls).toContain("/locations.json");
  });

  it("createShopifyClient validates credentials", () => {
    expect(() => createShopifyClient({} as any)).toThrow("accessToken");
    expect(() => createShopifyClient({ accessToken: "tok" } as any)).toThrow("storeName");
    const c = createShopifyClient({ accessToken: "x", storeName: "s" } as any);
    expect(c).toBeInstanceOf(ShopifyClient);
  });

  it("healthCheck uses /shop.json", async () => {
    const c = makeClient();
    let path = "";
    (c as any).client.get = async (p: string) => {
      path = p;
      return { ok: true };
    };
    expect(await c.healthCheck()).toBe(true);
    expect(path).toBe("/shop.json");
  });

  it("fails closed on unknown paths (HttpClient throws)", async () => {
    const c = makeClient();
    (c as any).client.get = async () => {
      throw new Error("Not Found");
    };
    await expect(c.listProducts()).rejects.toThrow("Not Found");
  });
});
