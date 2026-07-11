import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class WooClient {
  private client: HttpClient;
  constructor(consumerKey: string, consumerSecret: string, storeUrl: string) {
    this.client = new HttpClient({ baseUrl: `${storeUrl.replace(/\/+$/, "")}/wp-json/wc/v3`, rateLimit: { maxRequestsPerSecond: 5 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { Authorization: `Basic ${Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString("base64")}`, "Content-Type": "application/json" }; }
  private consumerKey = ""; private consumerSecret = "";

  async listProducts(): Promise<any[]> { const r = await this.client.get("/products", this.headers); return r.data || []; }
  async getProduct(id: number): Promise<any> { const r = await this.client.get(`/products/${id}`, this.headers); return r.data; }
  async createProduct(data: any): Promise<any> { const r = await this.client.post("/products", data, this.headers); return r.data; }
  async listOrders(): Promise<any[]> { const r = await this.client.get("/orders", this.headers); return r.data || []; }
  async getOrder(id: number): Promise<any> { const r = await this.client.get(`/orders/${id}`, this.headers); return r.data; }
  async listCustomers(): Promise<any[]> { const r = await this.client.get("/customers", this.headers); return r.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/", this.headers); return r.ok; } catch { return false; } }
}

export function createWooClient(config: ConnectionConfig): WooClient {
  const c = new WooClient(config.consumerKey || "", config.consumerSecret || "", config.storeUrl || "");
  c.consumerKey = config.consumerKey || ""; c.consumerSecret = config.consumerSecret || "";
  return c;
}