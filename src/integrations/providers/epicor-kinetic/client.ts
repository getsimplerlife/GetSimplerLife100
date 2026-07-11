import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class KineticClient {
  private client: HttpClient; private token: string;
  constructor(baseUrl: string, token: string, companyId: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl.replace(/\/+$/, "")}/api/v1/${companyId}`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.token = token;
  }
  private get headers() { return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }; }

  async get(endpoint: string, id?: string): Promise<any> { const p = id ? `/${endpoint}/${id}` : `/${endpoint}`; const r = await this.client.get(p, this.headers); return r.data; }
  async list(endpoint: string, filter?: string): Promise<any[]> { const p = filter ? `/${endpoint}?$filter=${encodeURIComponent(filter)}` : `/${endpoint}?$top=100`; const r = await this.client.get(p, this.headers); return r.data?.value || []; }
  async create(endpoint: string, data: any): Promise<any> { const r = await this.client.post(`/${endpoint}`, data, this.headers); return r.data; }
  async update(endpoint: string, id: string, data: any): Promise<void> { await this.client.patch(`/${endpoint}('${id}')`, data, this.headers); }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/Customer?$top=1", this.headers); return r.ok; } catch { return false; } }
}

export function createKineticClient(config: ConnectionConfig): KineticClient {
  return new KineticClient(config.baseUrl || "", config.token || "", config.companyId || "");
}