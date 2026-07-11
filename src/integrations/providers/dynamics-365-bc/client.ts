import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class BCClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private envName: string; private companyId: string;
  constructor(tokens: OAuthTokens, authConfig: any, envName: string, companyId: string) {
    this.client = new HttpClient({ baseUrl: `https://api.businesscentral.dynamics.com/v2.0/${authConfig.tenantId}/${envName}/api/v2.0/companies(${companyId})`, rateLimit: { maxRequestsPerSecond: 30 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.envName = envName; this.companyId = companyId;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshBCToken } = await import("./auth"); this.tokens = await refreshBCToken(this.authConfig, this.tokens.refreshToken); } }

  async list(entity: string, filter?: string): Promise<any[]> { await this.ensureToken(); const p = filter ? `/${entity}?$filter=${encodeURIComponent(filter)}` : `/${entity}`; const r = await this.client.get(p, this.headers); return r.data?.value || []; }
  async get(entity: string, id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/${entity}(${id})`, this.headers); return r.data; }
  async create(entity: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${entity}`, data, this.headers); return r.data; }
  async update(entity: string, id: string, data: any): Promise<void> { await this.ensureToken(); await this.client.patch(`/${entity}(${id})`, data, this.headers); }
  async delete(entity: string, id: string): Promise<void> { await this.ensureToken(); await this.client.delete(`/${entity}(${id})`, this.headers); }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/companies", this.headers); return r.ok; } catch { return false; } }
}

export function createBCClient(config: ConnectionConfig): BCClient {
  return new BCClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { tenantId: config.tenantId || "", clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.environmentName || "production", config.companyId || "");
}