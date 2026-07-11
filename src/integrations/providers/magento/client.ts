import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class MagentoClient {
  private client: HttpClient;
  constructor(accessToken: string, baseUrl: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl.replace(/\/+$/, "")}/rest/V1`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" }; }
  private accessToken = "";

  async listProducts(): Promise<any[]> { const r = await this.client.get("/products?searchCriteria[pageSize]=100", this.headers); return r.data?.items || []; }
  async getProduct(sku: string): Promise<any> { const r = await this.client.get(`/products/${encodeURIComponent(sku)}`, this.headers); return r.data; }
  async createProduct(data: any): Promise<any> { const r = await this.client.post("/products", { product: data }, this.headers); return r.data; }
  async listOrders(): Promise<any[]> { const r = await this.client.get("/orders?searchCriteria[pageSize]=100", this.headers); return r.data?.items || []; }
  async listCategories(): Promise<any[]> { const r = await this.client.get("/categories?searchCriteria[pageSize]=100", this.headers); return r.data?.items || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/store/storeConfigs", this.headers); return r.ok; } catch { return false; } }
}

export function createMagentoClient(config: ConnectionConfig): MagentoClient {
  const c = new MagentoClient(config.accessToken || "", config.baseUrl || "");
  c.accessToken = config.accessToken || "";
  return c;
}