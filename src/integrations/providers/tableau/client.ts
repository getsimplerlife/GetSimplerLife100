import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class TableauClient {
  private client: HttpClient; private pat: string; private siteId: string;
  constructor(personalAccessToken: string, serverUrl: string, siteId: string, apiVersion = "3.18") {
    this.client = new HttpClient({ baseUrl: `${serverUrl}/api/${apiVersion}`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.pat = personalAccessToken; this.siteId = siteId;
  }
  private get headers() { return { "X-Tableau-Auth": this.pat, "Content-Type": "application/json" }; }

  async listWorkbooks(): Promise<any[]> { const r = await this.client.get(`/sites/${this.siteId}/workbooks`, this.headers); return r.data?.workbooks?.workbook || []; }
  async listDatasources(): Promise<any[]> { const r = await this.client.get(`/sites/${this.siteId}/datasources`, this.headers); return r.data?.datasources?.datasource || []; }
  async listProjects(): Promise<any[]> { const r = await this.client.get(`/sites/${this.siteId}/projects`, this.headers); return r.data?.projects?.project || []; }
  async listUsers(): Promise<any[]> { const r = await this.client.get(`/sites/${this.siteId}/users`, this.headers); return r.data?.users?.user || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get(`/sites/${this.siteId}/workbooks?pageSize=1`, this.headers); return r.ok; } catch { return false; } }
}

export function createTableauClient(config: ConnectionConfig): TableauClient {
  return new TableauClient(config.pat || "", config.serverUrl || "", config.siteId || "", config.apiVersion || "3.18");
}