import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class SigmaClient {
  private client: HttpClient;
  constructor(clientId: string, clientSecret: string, baseUrl: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl}/api/v2`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`, "Content-Type": "application/json" }; }
  private clientId = ""; private clientSecret = "";

  async listConnections(): Promise<any[]> { const r = await this.client.get("/connections", this.headers); return r.data?.entries || []; }
  async listDatasets(): Promise<any[]> { const r = await this.client.get("/datasets", this.headers); return r.data?.entries || []; }
  async listWorkbooks(): Promise<any[]> { const r = await this.client.get("/workbooks", this.headers); return r.data?.entries || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/connections?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createSigmaClient(config: ConnectionConfig): SigmaClient {
  const c = new SigmaClient(config.clientId || "", config.clientSecret || "", config.baseUrl || "https://app.sigmacomputing.com");
  c.clientId = config.clientId || ""; c.clientSecret = config.clientSecret || "";
  return c;
}