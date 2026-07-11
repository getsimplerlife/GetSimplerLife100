import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class XeroClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private tenantId: string;
  constructor(tokens: OAuthTokens, authConfig: any, tenantId: string) {
    this.client = new HttpClient({ baseUrl: "https://api.xero.com/api.xro/2.0", rateLimit: { maxRequestsPerSecond: 60 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.tenantId = tenantId;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Xero-tenant-id": this.tenantId, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshXeroToken } = await import("./auth"); this.tokens = await refreshXeroToken(this.authConfig, this.tokens.refreshToken); } }

  async get(entity: string, id?: string): Promise<any> { const p = id ? `/${entity}/${id}` : `/${entity}`; const r = await this.client.get(p, this.headers); return r.data; }
  async list(entity: string, filter?: string): Promise<any[]> { const p = filter ? `/${entity}?where=${encodeURIComponent(filter)}` : `/${entity}`; const r = await this.client.get(p, this.headers); return r.data?.[entity] || []; }
  async create(entity: string, data: any): Promise<any> { const r = await this.client.post(`/${entity}`, data, this.headers); return r.data; }
  async update(entity: string, id: string, data: any): Promise<void> { await this.client.post(`/${entity}/${id}`, data, this.headers); }
  async getOrganisations(): Promise<any> { const r = await this.client.get("/Organisation", this.headers); return r.data?.Organisation || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/Organisation", this.headers); return r.ok; } catch { return false; } }
}

export function createXeroClient(config: ConnectionConfig): XeroClient {
  return new XeroClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.tenantId || "");
}