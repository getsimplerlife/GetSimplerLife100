import { HttpClient } from "../../framework/client";
import { ConnectionConfig } from "../../framework/connection";
export class Epicor_kinetic_mfgClient {
  private client: HttpClient;
  constructor(apiKey: string) {
    this.client = new HttpClient({ baseUrl: "https://api.epicor-kinetic-mfg.com/v1", rateLimit: { maxRequestsPerSecond: 5 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { Authorization: "Bearer " + this.apiKey, "Content-Type": "application/json" }; }
  private apiKey = "";
  async listItems(): Promise<any[]> { const r = await this.client.get("/items", this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/items?limit=1", this.headers); return r.ok; } catch { return false; } }
}
export function createEpicor_kinetic_mfgClient(config: ConnectionConfig): Epicor_kinetic_mfgClient {
  const c = new Epicor_kinetic_mfgClient(config.apiKey || "");
  c.apiKey = config.apiKey || "";
  return c;
}
