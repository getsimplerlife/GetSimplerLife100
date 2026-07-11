import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class QlikClient {
  private client: HttpClient;
  constructor(apiKey: string, serverUrl: string) {
    this.client = new HttpClient({ baseUrl: `${serverUrl}/api/v1`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }; }
  private apiKey = "";

  async listApps(): Promise<any[]> { const r = await this.client.get("/apps", this.headers); return r.data?.data || []; }
  async listStreams(): Promise<any[]> { const r = await this.client.get("/streams", this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/apps?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createQlikClient(config: ConnectionConfig): QlikClient {
  const c = new QlikClient(config.apiKey || "", config.serverUrl || "");
  c.apiKey = config.apiKey || "";
  return c;
}