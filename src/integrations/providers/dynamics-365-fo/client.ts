import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class FOClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private baseUrl: string;
  constructor(tokens: OAuthTokens, authConfig: any, baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.client = new HttpClient({ baseUrl: `${this.baseUrl}/data`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 2000, maxDelay: 15000 }, timeout: 60000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", "OData-MaxVersion": "4.0" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshFOToken } = await import("./auth"); this.tokens = await refreshFOToken(this.authConfig, this.tokens.refreshToken); } }

  async list(entitySet: string, filter?: string): Promise<any[]> { await this.ensureToken(); const p = filter ? `/${entitySet}?$filter=${encodeURIComponent(filter)}` : `/${entitySet}`; const r = await this.client.get(p, this.headers); return r.data?.value || []; }
  async get(entitySet: string, key: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/${entitySet}(${key})`, this.headers); return r.data; }
  async create(entitySet: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${entitySet}`, data, this.headers); return r.data; }
  async update(entitySet: string, key: string, data: any): Promise<void> { await this.ensureToken(); await this.client.patch(`/${entitySet}(${key})`, data, this.headers); }
  async callAction(action: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${action}`, data, { ...this.headers, "Content-Type": "application/json" }); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/Customers?$top=1", this.headers); return r.ok; } catch { return false; } }
}

export function createFOClient(config: ConnectionConfig): FOClient {
  return new FOClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { tenantId: config.tenantId || "", clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.baseUrl || "");
}