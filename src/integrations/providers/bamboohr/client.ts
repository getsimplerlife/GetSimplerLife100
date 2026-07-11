import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class BambooHRClient {
  private client: HttpClient; private apiKey: string; private subdomain: string;
  constructor(apiKey: string, subdomain: string) {
    this.client = new HttpClient({ baseUrl: `https://api.bamboohr.com/api/gateway.php/${subdomain}/v1`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.apiKey = apiKey; this.subdomain = subdomain;
  }
  private get headers() { return { Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`, "Content-Type": "application/json" }; }

  async listEmployees(limit = 100): Promise<any[]> { const r = await this.client.get(`/employees/directory?limit=${limit}`, this.headers); return r.data?.employees || []; }
  async getEmployee(id: string): Promise<any> { const r = await this.client.get(`/employees/${id}`, this.headers); return r.data; }
  async listTimeOffRequests(employeeId?: string): Promise<any[]> { const p = employeeId ? `/${employeeId}/timeoff/requests` : ``; const r = await this.client.get(`/employees${p}`, this.headers); return r.data || []; }
  async listCompanyFiles(): Promise<any[]> { const r = await this.client.get("/files/view", this.headers); return r.data?.categories || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/employees/directory?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createBambooHRClient(config: ConnectionConfig): BambooHRClient {
  return new BambooHRClient(config.apiKey || "", config.subdomain || "");
}