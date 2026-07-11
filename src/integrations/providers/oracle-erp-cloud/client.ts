import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class OracleERPClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any, baseUrl: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl.replace(/\/+$/, "")}/fscmRestApi/resources/11.13.18.05`, rateLimit: { maxRequestsPerSecond: 15 }, retry: { maxRetries: 3, baseDelay: 2000, maxDelay: 15000 }, timeout: 60000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", Accept: "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshOracleToken } = await import("./auth"); this.tokens = await refreshOracleToken(this.authConfig, this.tokens.refreshToken); } }

  async list(entity: string, filter?: string): Promise<any[]> { await this.ensureToken(); const p = filter ? `/${entity}?finder=${encodeURIComponent(filter)}` : `/${entity}?limit=100`; const r = await this.client.get(p, this.headers); return r.data?.items || []; }
  async get(entity: string, id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/${entity}/${id}`, this.headers); return r.data; }
  async create(entity: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${entity}`, data, this.headers); return r.data; }
  async update(entity: string, id: string, data: any): Promise<void> { await this.ensureToken(); await this.client.patch(`/${entity}/${id}`, data, this.headers); }

  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/customers?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createOracleERPClient(config: ConnectionConfig): OracleERPClient {
  return new OracleERPClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "", baseUrl: config.baseUrl },
    config.baseUrl || "");
}