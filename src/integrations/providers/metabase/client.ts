import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class MetabaseClient {
  private client: HttpClient; private sessionToken: string;
  constructor(baseUrl: string, sessionToken: string) {
    this.client = new HttpClient({ baseUrl, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.sessionToken = sessionToken;
  }
  private get headers() { return { "X-Metabase-Session": this.sessionToken, "Content-Type": "application/json" }; }

  async listQuestions(): Promise<any[]> { const r = await this.client.get("/api/card", this.headers); return r.data || []; }
  async getQuestion(id: number): Promise<any> { const r = await this.client.get(`/api/card/${id}`, this.headers); return r.data; }
  async runQuery(data: any): Promise<any> { const r = await this.client.post("/api/dataset", data, this.headers); return r.data; }
  async listDatabases(): Promise<any[]> { const r = await this.client.get("/api/database", this.headers); return r.data?.data || []; }
  async listDashboards(): Promise<any[]> { const r = await this.client.get("/api/dashboard", this.headers); return r.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/api/user/current", this.headers); return r.ok; } catch { return false; } }
}

export function createMetabaseClient(config: ConnectionConfig): MetabaseClient {
  return new MetabaseClient(config.baseUrl || "http://localhost:3000", config.sessionToken || "");
}