import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class McLeodClient {
  private client: HttpClient;
  constructor(apiKey: string, baseUrl: string) {
    this.client = new HttpClient({ baseUrl: baseUrl || "https://api.mcleodsoftware.com/v1", rateLimit: { maxRequestsPerSecond: 5 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { "X-API-Key": this.apiKey, "Content-Type": "application/json" }; }
  private apiKey = "";

  async listDispatches(): Promise<any[]> { const r = await this.client.get("/dispatch", this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/dispatch?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createMcLeodClient(config: ConnectionConfig): McLeodClient {
  const c = new McLeodClient(config.apiKey || "", config.baseUrl || "");
  c.apiKey = config.apiKey || "";
  return c;
}