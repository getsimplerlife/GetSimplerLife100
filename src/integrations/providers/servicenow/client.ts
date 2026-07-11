import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class ServiceNowClient {
  private client: HttpClient; private user: string; private pass: string;
  constructor(user: string, pass: string, instance: string) {
    this.client = new HttpClient({ baseUrl: `https://${instance}.service-now.com/api/now/v2`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.user = user; this.pass = pass;
  }
  private get headers() { return { Authorization: `Basic ${Buffer.from(`${this.user}:${this.pass}`).toString("base64")}`, "Content-Type": "application/json", Accept: "application/json" }; }

  async listIncidents(): Promise<any[]> { const r = await this.client.get("/table/incident?sysparm_limit=100", this.headers); return r.data?.result || []; }
  async getIncident(sysId: string): Promise<any> { const r = await this.client.get(`/table/incident/${sysId}`, this.headers); return r.data?.result; }
  async createIncident(data: any): Promise<any> { const r = await this.client.post("/table/incident", data, this.headers); return r.data?.result; }
  async updateIncident(sysId: string, data: any): Promise<any> { const r = await this.client.patch(`/table/incident/${sysId}`, data, this.headers); return r.data?.result; }
  async listTables(): Promise<any[]> { const r = await this.client.get("/table/sys_db_object?sysparm_limit=50", this.headers); return r.data?.result || []; }
  async queryTable(table: string, query?: string): Promise<any[]> { const p = query ? `/table/${table}?sysparm_query=${encodeURIComponent(query)}` : `/table/${table}?sysparm_limit=100`; const r = await this.client.get(p, this.headers); return r.data?.result || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/table/incident?sysparm_limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createServiceNowClient(config: ConnectionConfig): ServiceNowClient {
  return new ServiceNowClient(config.user || "", config.password || "", config.instance || "");
}