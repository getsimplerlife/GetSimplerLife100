import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class Sage50Client {
  private client: HttpClient; private token: string;
  constructor(baseUrl: string, token: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl.replace(/\/+$/, "")}/api/v1`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.token = token;
  }
  private get headers() { return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }; }

  async list(entity: string, filter?: string): Promise<any[]> { const p = filter ? `/${entity}?$filter=${encodeURIComponent(filter)}` : `/${entity}?$top=100`; const r = await this.client.get(p, this.headers); return r.data?.value || []; }
  async get(entity: string, id: string): Promise<any> { const r = await this.client.get(`/${entity}('${id}')`, this.headers); return r.data; }
  async create(entity: string, data: any): Promise<any> { const r = await this.client.post(`/${entity}`, data, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/Customer?$top=1", this.headers); return r.ok; } catch { return false; } }
}

export function createSage50Client(config: ConnectionConfig): Sage50Client {
  return new Sage50Client(config.baseUrl || "", config.token || "");
}