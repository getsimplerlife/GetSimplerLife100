import { HttpClient } from "../../framework/client";
import { ConnectionConfig } from "../../framework/connection";
export class DatClient {
  private client: HttpClient;
  constructor(apiKey: string) {
    this.client = new HttpClient({ baseUrl: "https://api.dat.com/v1", rateLimit: { maxRequestsPerSecond: 5 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { Authorization: "Bearer " + this.apiKey, "Content-Type": "application/json" }; }
  private apiKey = "";
  async listItems(): Promise<any[]> { const r = await this.client.get("/items", this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/items?limit=1", this.headers); return r.ok; } catch { return false; } }
}
export function createDatClient(config: ConnectionConfig): DatClient {
  const c = new DatClient(config.apiKey || "");
  c.apiKey = config.apiKey || "";
  return c;
}
