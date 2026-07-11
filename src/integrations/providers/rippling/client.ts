import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class RipplingClient {
  private client: HttpClient; private apiKey: string;
  constructor(apiKey: string) {
    this.client = new HttpClient({ baseUrl: "https://api.rippling.com/v1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.apiKey = apiKey;
  }
  private get headers() { return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }; }

  async listEmployees(limit = 100): Promise<any[]> { const r = await this.client.get(`/employees?limit=${limit}`, this.headers); return r.data?.results || []; }
  async getEmployee(id: string): Promise<any> { const r = await this.client.get(`/employees/${id}`, this.headers); return r.data; }
  async listApps(): Promise<any[]> { const r = await this.client.get("/apps", this.headers); return r.data?.results || []; }
  async listDevices(): Promise<any[]> { const r = await this.client.get("/devices", this.headers); return r.data?.results || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/employees?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createRipplingClient(config: ConnectionConfig): RipplingClient {
  return new RipplingClient(config.apiKey || "");
}