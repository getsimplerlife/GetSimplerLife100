import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class AcumaticaClient {
  private client: HttpClient; private cookie: string;
  constructor(siteUrl: string, cookie: string) {
    this.client = new HttpClient({ baseUrl: `${siteUrl.replace(/\/+$/, "")}/api`, rateLimit: { maxRequestsPerSecond: 15 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.cookie = cookie;
  }
  private get headers() { return { Cookie: this.cookie, "Content-Type": "application/json" }; }

  async list(endpoint: string, filter?: string): Promise<any[]> { const p = filter ? `/${endpoint}?$filter=${encodeURIComponent(filter)}` : `/${endpoint}`; const r = await this.client.get(p, this.headers); return r.data || []; }
  async get(endpoint: string, id: string): Promise<any> { const r = await this.client.get(`/${endpoint}/${id}`, this.headers); return r.data; }
  async create(endpoint: string, data: any): Promise<any> { const r = await this.client.post(`/${endpoint}`, data, this.headers); return r.data; }
  async update(endpoint: string, id: string, data: any): Promise<void> { await this.client.put(`/${endpoint}/${id}`, data, this.headers); }
  async submitAction(endpoint: string, action: string, data?: any): Promise<any> { const r = await this.client.post(`/${endpoint}/${action}`, data || {}, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/Customer?$top=1", this.headers); return r.ok; } catch { return false; } }
}

export function createAcumaticaClient(config: ConnectionConfig): AcumaticaClient {
  return new AcumaticaClient(config.siteUrl || "", config.cookie || "");
}