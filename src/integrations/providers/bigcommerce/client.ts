import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class BigCommerceClient {
  private client: HttpClient;
  constructor(accessToken: string, storeHash: string) {
    this.client = new HttpClient({ baseUrl: `https://api.bigcommerce.com/stores/${storeHash}/v3`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { "X-Auth-Token": this.accessToken, "Content-Type": "application/json", Accept: "application/json" }; }
  private accessToken = "";

  async listProducts(): Promise<any[]> { const r = await this.client.get("/catalog/products", this.headers); return r.data?.data || []; }
  async getProduct(id: number): Promise<any> { const r = await this.client.get(`/catalog/products/${id}`, this.headers); return r.data?.data; }
  async createProduct(data: any): Promise<any> { const r = await this.client.post("/catalog/products", data, this.headers); return r.data?.data; }
  async listOrders(): Promise<any[]> { const r = await this.client.get("/orders", this.headers); return r.data?.data || []; }
  async listCustomers(): Promise<any[]> { const r = await this.client.get("/customers", this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/catalog/products?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createBigCommerceClient(config: ConnectionConfig): BigCommerceClient {
  const c = new BigCommerceClient(config.accessToken || "", config.storeHash || "");
  c.accessToken = config.accessToken || "";
  return c;
}