import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";
export class MGClient {
  private client: HttpClient;
  constructor(apiKey: string) { this.client = new HttpClient({ baseUrl: "https://api.mercurygate.com/v1", rateLimit: { maxRequestsPerSecond: 5 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 }); }
  private get headers() { return { "X-API-Key": this.apiKey, "Content-Type": "application/json" }; }
  private apiKey = "";
  async listShipments(): Promise<any[]> { const r = await this.client.get("/shipments", this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/shipments?limit=1", this.headers); return r.ok; } catch { return false; } }
}
export function createMGClient(config: ConnectionConfig): MGClient { const c = new MGClient(config.apiKey || ""); c.apiKey = config.apiKey || ""; return c; }