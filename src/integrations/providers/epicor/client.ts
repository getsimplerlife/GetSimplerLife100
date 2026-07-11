import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class EpicorClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any, baseUrl: string, companyId: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl.replace(/\/+$/, "")}/api/v2/${companyId}`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshEpicorToken } = await import("./auth"); this.tokens = await refreshEpicorToken(this.authConfig, this.tokens.refreshToken); } }

  async list(ep: string, filter?: string): Promise<any[]> { await this.ensureToken(); const p = filter ? `/${ep}?$filter=${encodeURIComponent(filter)}` : `/${ep}?$top=100`; const r = await this.client.get(p, this.headers); return r.data?.value || r.data || []; }
  async get(ep: string, id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/${ep}('${id}')`, this.headers); return r.data; }
  async create(ep: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${ep}`, data, this.headers); return r.data; }
  async update(ep: string, id: string, data: any): Promise<void> { await this.ensureToken(); await this.client.patch(`/${ep}('${id}')`, data, this.headers); }
  async runBAQ(baqId: string, params?: any): Promise<any[]> {
    await this.ensureToken();
    const r = await this.client.post(`/BAQ/${baqId}`, params || {}, this.headers);
    return r.data?.value || r.data || [];
  }
  async healthCheck(): Promise<boolean> {
    try { const r = await this.client.get("/Customer?$top=1", this.headers); return r.ok; } catch { return false; }
  }
}

export function createEpicorClient(config: ConnectionConfig): EpicorClient {
  return new EpicorClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "", baseUrl: config.baseUrl },
    config.baseUrl || "", config.companyId || "");
}