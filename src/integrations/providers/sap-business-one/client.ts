import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class B1Client {
  private client: HttpClient; private sessionId: string;
  constructor(baseUrl: string, sessionId: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl.replace(/\/+$/, "")}/ServiceLayer/v2`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.sessionId = sessionId;
  }
  private get headers() { return { Cookie: `B1SESSION=${this.sessionId}`, "Content-Type": "application/json", Prefer: "odata.maxpagesize=100" }; }

  async get(entity: string, id?: number): Promise<any> { const p = id ? `/${entity}(${id})` : `/${entity}`; const r = await this.client.get(p, this.headers); return r.data?.value || r.data; }
  async list(entity: string, filter?: string): Promise<any[]> { const p = filter ? `/${entity}?$filter=${encodeURIComponent(filter)}` : `/${entity}?$top=100`; const r = await this.client.get(p, this.headers); return r.data?.value || []; }
  async create(entity: string, data: any): Promise<any> { const r = await this.client.post(`/${entity}`, data, this.headers); return r.data; }
  async update(entity: string, id: number, data: any): Promise<void> { await this.client.patch(`/${entity}(${id})`, data, this.headers); }

  async healthCheck(): Promise<boolean> {
    try { const r = await this.client.get("/BusinessPartners?$top=1", this.headers); return r.ok; } catch { return false; }
  }
}

export function createB1Client(config: ConnectionConfig): B1Client {
  return new B1Client(config.baseUrl || "", config.sessionId || "");
}