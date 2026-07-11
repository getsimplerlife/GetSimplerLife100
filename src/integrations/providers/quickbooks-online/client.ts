import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class QBOClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private companyId: string;
  constructor(tokens: OAuthTokens, authConfig: any, companyId: string) {
    this.client = new HttpClient({ baseUrl: `https://quickbooks.api.intuit.com/v3/company/${companyId}`, rateLimit: { maxRequestsPerSecond: 25 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.companyId = companyId;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", Accept: "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshQBToken } = await import("../quickbooks-enterprise/auth"); this.tokens = await refreshQBToken(this.authConfig, this.tokens.refreshToken); } }

  async query(sql: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/query?query=${encodeURIComponent(sql)}&minorversion=73`, this.headers); return r.data?.QueryResponse; }
  async create(entity: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${entity}?minorversion=73`, data, this.headers); return r.data; }
  async get(entity: string, id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/${entity}/${id}?minorversion=73`, this.headers); return r.data; }
  async update(entity: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${entity}?minorversion=73&operation=update`, data, this.headers); return r.data; }
  async batch(entities: any[]): Promise<any> { await this.ensureToken(); const r = await this.client.post("/batch?minorversion=73", { BatchItemRequest: entities }, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get(`/companyinfo/${this.companyId}?minorversion=73`, this.headers); return r.ok; } catch { return false; } }
}

export function createQBOClient(config: ConnectionConfig): QBOClient {
  return new QBOClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.companyId || "");
}