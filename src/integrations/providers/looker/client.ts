import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class LookerClient {
  private client: HttpClient;
  constructor(clientId: string, clientSecret: string, baseUrl: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl}/api/4.0`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { Authorization: `token ${this.clientId}:${this.clientSecret}`, "Content-Type": "application/json" }; }
  private clientId = ""; private clientSecret = "";

  async login(): Promise<string> { const r = await this.client.post("/login", { client_id: this.clientId, client_secret: this.clientSecret }, { "Content-Type": "application/json" }); return r.data?.access_token; }
  async listLooks(): Promise<any[]> { const r = await this.client.get("/looks", this.headers); return r.data || []; }
  async runLook(lookId: number): Promise<any> { const r = await this.client.get(`/looks/${lookId}/run/json`, this.headers); return r.data; }
  async listDashboards(): Promise<any[]> { const r = await this.client.get("/dashboards", this.headers); return r.data || []; }
  async getDashboard(id: string): Promise<any> { const r = await this.client.get(`/dashboards/${id}`, this.headers); return r.data; }
  async runSql(query: string): Promise<any> { const r = await this.client.post("/queries/run/sql", { sql: query }, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/looks?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createLookerClient(config: ConnectionConfig): LookerClient {
  const c = new LookerClient(config.clientId || "", config.clientSecret || "", config.baseUrl || "");
  c.clientId = config.clientId || ""; c.clientSecret = config.clientSecret || "";
  return c;
}