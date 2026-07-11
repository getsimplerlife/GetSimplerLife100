import { HttpClient } from "../../framework/client";
import { ConnectionConfig } from "../../framework/connection";
export class Project44Client {
  private client: HttpClient;
  constructor(apiKey: string) {
    this.client = new HttpClient({ baseUrl: "https://api.project44.com/v1", rateLimit: { maxRequestsPerSecond: 5 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { Authorization: "Bearer " + this.apiKey, "Content-Type": "application/json" }; }
  private apiKey = "";
  async listItems(): Promise<any[]> { const r = await this.client.get("/items", this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/items?limit=1", this.headers); return r.ok; } catch { return false; } }
}
export function createProject44Client(config: ConnectionConfig): Project44Client {
  const c = new Project44Client(config.apiKey || "");
  c.apiKey = config.apiKey || "";
  return c;
}
