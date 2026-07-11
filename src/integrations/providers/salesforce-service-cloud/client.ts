import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class ServiceCloudClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private instanceUrl: string;
  constructor(tokens: OAuthTokens, authConfig: any, instanceUrl: string) {
    this.instanceUrl = instanceUrl; this.client = new HttpClient({ baseUrl: `${instanceUrl}/services/data/v62.0`, rateLimit: { maxRequestsPerSecond: 25 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 60000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshSSToken } = await import("./auth"); this.tokens = await refreshSSToken(this.authConfig, this.tokens.refreshToken); } }

  async listCases(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/sobjects/Case/describe", this.headers); return r.data?.fields || []; }
  async createCase(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/sobjects/Case", data, this.headers); return r.data; }
  async getCase(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/sobjects/Case/${id}`, this.headers); return r.data; }
  async queryCases(where?: string): Promise<any[]> { await this.ensureToken(); const q = where ? `SELECT+Id,CaseNumber,Subject,Status,Priority,Origin+FROM+Case+WHERE+${encodeURIComponent(where)}` : "SELECT+Id,CaseNumber,Subject,Status,Priority+FROM+Case+LIMIT+100"; const r = await this.client.get(`/query?q=${q}`, this.headers); return r.data?.records || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/sobjects/Case/describe", this.headers); return r.ok; } catch { return false; } }
}

export function createServiceCloudClient(config: ConnectionConfig): ServiceCloudClient {
  return new ServiceCloudClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.instanceUrl || "");
}