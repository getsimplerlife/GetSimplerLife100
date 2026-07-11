import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class PBIClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.powerbi.com/v1.0/myorg", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshPBToken } = await import("./auth"); this.tokens = await refreshPBToken(this.authConfig, this.tokens.refreshToken); } }

  async listDatasets(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/datasets", this.headers); return r.data?.value || []; }
  async listReports(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/reports", this.headers); return r.data?.value || []; }
  async listDashboards(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/dashboards", this.headers); return r.data?.value || []; }
  async listGroups(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/groups", this.headers); return r.data?.value || []; }
  async refreshDataset(datasetId: string): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/datasets/${datasetId}/refreshes`, {}, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/datasets?$top=1", this.headers); return r.ok; } catch { return false; } }
}

export function createPBIClient(config: ConnectionConfig): PBIClient {
  return new PBIClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { tenantId: config.tenantId || "", clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}