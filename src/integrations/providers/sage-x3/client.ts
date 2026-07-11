import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class SageX3Client {
  private client: HttpClient; private token: string;
  constructor(baseUrl: string, token: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl.replace(/\/+$/, "")}/api`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.token = token;
  }
  private get headers() { return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", "Accept-Language": "ENG" }; }

  async list(entity: string, filter?: string): Promise<any[]> { const p = filter ? `/${entity}?$filter=${encodeURIComponent(filter)}` : `/${entity}?$top=100`; const r = await this.client.get(p, this.headers); return r.data?.value || r.data || []; }
  async get(entity: string, key: string): Promise<any> { const r = await this.client.get(`/${entity}/${key}`, this.headers); return r.data; }
  async create(entity: string, data: any): Promise<any> { const r = await this.client.post(`/${entity}`, data, this.headers); return r.data; }
  async update(entity: string, key: string, data: any): Promise<void> { await this.client.patch(`/${entity}/${key}`, data, this.headers); }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/BP?$top=1", this.headers); return r.ok; } catch { return false; } }
}

export function createSageX3Client(config: ConnectionConfig): SageX3Client {
  return new SageX3Client(config.baseUrl || "", config.token || "");
}