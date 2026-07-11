import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class InforClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any, baseUrl: string, tenantId: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl.replace(/\/+$/, "")}/M3/api/v1/${tenantId}`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", "M3-User": "api_user" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshInforToken } = await import("./auth"); this.tokens = await refreshInforToken(this.authConfig, this.tokens.refreshToken); } }

  async execute(program: string, transaction: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${program}/${transaction}`, data, this.headers); return r.data; }
  async list(program: string, transaction: string, filter?: string): Promise<any[]> { await this.ensureToken(); const p = filter ? `/${program}/${transaction}?$filter=${encodeURIComponent(filter)}` : `/${program}/${transaction}`; const r = await this.client.get(p, this.headers); return r.data?.items || r.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/CRS610/MthName?$top=1", this.headers); return r.ok; } catch { return false; } }
}

export function createInforClient(config: ConnectionConfig): InforClient {
  return new InforClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "", baseUrl: config.baseUrl },
    config.baseUrl || "", config.tenantId || "");
}