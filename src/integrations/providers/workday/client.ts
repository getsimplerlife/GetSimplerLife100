import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class WorkdayClient {
  private client: HttpClient; private token: string; private tenant: string;
  constructor(token: string, tenant: string) {
    this.client = new HttpClient({ baseUrl: `https://${tenant}.myworkday.com/api/v1`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.token = token; this.tenant = tenant;
  }
  private get headers() { return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }; }

  async listWorkers(): Promise<any[]> { const r = await this.client.get("/workers", this.headers); return r.data?.data || []; }
  async getWorker(id: string): Promise<any> { const r = await this.client.get(`/workers/${id}`, this.headers); return r.data; }
  async listOrganizations(): Promise<any[]> { const r = await this.client.get("/organizations", this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/workers?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createWorkdayClient(config: ConnectionConfig): WorkdayClient {
  return new WorkdayClient(config.token || "", config.tenant || "");
}