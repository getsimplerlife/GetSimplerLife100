import { HttpClient } from "../../framework/client";
import { getShopifyAuthHeaders, getShopifyBaseUrl, validateShopifyCredential, type ShopifyCredential } from "./auth";
import type { ConnectionConfig } from "../../framework/connection";

/**
 * Canonical Shopify Admin API client.
 *
 * All paths are relative to https://{store}.myshopify.com/admin/api/{version}.
 * Reads are fail-closed: unknown paths throw.
 * Writes require X-Shopify-Access-Token header.
 */
export class ShopifyClient {
  private client: HttpClient;
  private accessToken: string;
  private storeName: string;

  constructor(accessToken: string, storeName: string, apiVersion?: string) {
    if (!accessToken) throw new Error("Shopify accessToken is required");
    if (!storeName) throw new Error("Shopify storeName is required");
    this.accessToken = accessToken;
    this.storeName = storeName;
    this.client = new HttpClient({
      baseUrl: getShopifyBaseUrl(storeName, apiVersion),
      rateLimit: { maxRequestsPerSecond: 2 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
  }

  private get headers(): Record<string, string> {
    return getShopifyAuthHeaders(this.accessToken);
  }

  // ── Products ──
  async listProducts(params?: { limit?: number; sinceId?: number }): Promise<any[]> {
    let query = "";
    if (params?.limit) query = `limit=${params.limit}`;
    if (params?.sinceId) query += `${query ? "&" : ""}since_id=${params.sinceId}`;
    const path = `/products.json${query ? `?${query}` : ""}`;
    const r = await this.client.get(path, this.headers);
    return r.data?.products || [];
  }

  async getProduct(id: number): Promise<any> {
    const r = await this.client.get(`/products/${id}.json`, this.headers);
    return r.data?.product;
  }

  async getProductVariants(productId: number): Promise<any[]> {
    const r = await this.client.get(`/products/${productId}/variants.json`, this.headers);
    return r.data?.variants || [];
  }

  async createProduct(data: Record<string, unknown>): Promise<any> {
    const r = await this.client.post("/products.json", { product: data }, this.headers);
    return r.data?.product;
  }

  async updateProduct(id: number, data: Record<string, unknown>): Promise<any> {
    const r = await this.client.put(`/products/${id}.json`, { product: data }, this.headers);
    return r.data?.product;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const r = await this.client.delete(`/products/${id}.json`, this.headers);
    return r.ok;
  }

  // ── Orders ──
  async listOrders(params?: { status?: string; limit?: number }): Promise<any[]> {
    let query = "status=any";
    if (params?.status) query = `status=${params.status}`;
    if (params?.limit) query += `&limit=${params.limit}`;
    const path = `/orders.json?${query}`;
    const r = await this.client.get(path, this.headers);
    return r.data?.orders || [];
  }

  async getOrder(id: number): Promise<any> {
    const r = await this.client.get(`/orders/${id}.json`, this.headers);
    return r.data?.order;
  }

  // ── Customers ──
  async listCustomers(params?: { limit?: number }): Promise<any[]> {
    const query = params?.limit ? `?limit=${params.limit}` : "";
    const r = await this.client.get(`/customers.json${query}`, this.headers);
    return r.data?.customers || [];
  }

  async getCustomer(id: number): Promise<any> {
    const r = await this.client.get(`/customers/${id}.json`, this.headers);
    return r.data?.customer;
  }

  // ── Inventory ──
  async listInventoryLevels(params: { locationId?: number; inventoryItemIds?: number[] }): Promise<any[]> {
    const queryParts: string[] = [];
    if (params.locationId) queryParts.push(`location_ids=${params.locationId}`);
    if (params.inventoryItemIds?.length) queryParts.push(`inventory_item_ids=${params.inventoryItemIds.join(",")}`);
    const query = queryParts.length ? `?${queryParts.join("&")}` : "";
    const r = await this.client.get(`/inventory_levels.json${query}`, this.headers);
    return r.data?.inventory_levels || [];
  }

  async getInventoryLevel(inventoryItemId: number, locationId: number): Promise<any> {
    const r = await this.client.get(
      `/inventory_levels.json?inventory_item_ids=${inventoryItemId}&location_ids=${locationId}`,
      this.headers,
    );
    return r.data?.inventory_levels?.[0];
  }

  // ── Fulfillments ──
  async listFulfillments(orderId: number): Promise<any[]> {
    const r = await this.client.get(`/orders/${orderId}/fulfillments.json`, this.headers);
    return r.data?.fulfillments || [];
  }

  async getFulfillment(orderId: number, fulfillmentId: number): Promise<any> {
    const r = await this.client.get(`/orders/${orderId}/fulfillments/${fulfillmentId}.json`, this.headers);
    return r.data?.fulfillment;
  }

  async createFulfillment(orderId: number, data: Record<string, unknown>): Promise<any> {
    const r = await this.client.post(`/orders/${orderId}/fulfillments.json`, { fulfillment: data }, this.headers);
    return r.data?.fulfillment;
  }

  async updateFulfillment(orderId: number, fulfillmentId: number, data: Record<string, unknown>): Promise<any> {
    const r = await this.client.put(
      `/orders/${orderId}/fulfillments/${fulfillmentId}.json`,
      { fulfillment: data },
      this.headers,
    );
    return r.data?.fulfillment;
  }

  // ── Locations ──
  async listLocations(): Promise<any[]> {
    const r = await this.client.get("/locations.json", this.headers);
    return r.data?.locations || [];
  }

  // ── Health ──
  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.client.get("/shop.json", this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export function createShopifyClient(config: ConnectionConfig): ShopifyClient {
  const cred: ShopifyCredential = validateShopifyCredential({
    accessToken: config.accessToken || (config.apiKey as string) || "",
    storeName: config.storeName || (config.subdomain as string) || "",
    apiVersion: (config as any).apiVersion,
  });
  const client = new ShopifyClient(cred.accessToken, cred.storeName, cred.apiVersion);
  return client;
}
