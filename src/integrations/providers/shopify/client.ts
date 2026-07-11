import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class ShopifyClient {
  private client: HttpClient;
  constructor(accessToken: string, storeName: string) {
    this.client = new HttpClient({ baseUrl: `https://${storeName}.myshopify.com/admin/api/2024-01`, rateLimit: { maxRequestsPerSecond: 2 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { "X-Shopify-Access-Token": this.accessToken, "Content-Type": "application/json" }; }
  private accessToken = "";

  async listProducts(): Promise<any[]> { const r = await this.client.get("/products.json", this.headers); return r.data?.products || []; }
  async getProduct(id: number): Promise<any> { const r = await this.client.get(`/products/${id}.json`, this.headers); return r.data?.product; }
  async createProduct(data: any): Promise<any> { const r = await this.client.post("/products.json", { product: data }, this.headers); return r.data?.product; }
  async listOrders(): Promise<any[]> { const r = await this.client.get("/orders.json", this.headers); return r.data?.orders || []; }
  async getOrder(id: number): Promise<any> { const r = await this.client.get(`/orders/${id}.json`, this.headers); return r.data?.order; }
  async listCustomers(): Promise<any[]> { const r = await this.client.get("/customers.json", this.headers); return r.data?.customers || []; }
  async listInventoryLevels(locationId: number): Promise<any[]> { const r = await this.client.get(`/locations/${locationId}/inventory_levels.json`, this.headers); return r.data?.inventory_levels || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/products.json?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createShopifyClient(config: ConnectionConfig): ShopifyClient {
  const c = new ShopifyClient(config.accessToken || "", config.storeName || "");
  c.accessToken = config.accessToken || "";
  return c;
}