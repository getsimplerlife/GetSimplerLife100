import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class QBEClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private companyId: string; private minorVersion: string;
  constructor(tokens: OAuthTokens, authConfig: any, companyId: string, minorVersion = "73") {
    this.client = new HttpClient({ baseUrl: `https://quickbooks.api.intuit.com/v3/company/${companyId}`, rateLimit: { maxRequestsPerSecond: 15 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.companyId = companyId; this.minorVersion = minorVersion;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", Accept: "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshQBToken } = await import("./auth"); this.tokens = await refreshQBToken(this.authConfig, this.tokens.refreshToken); } }

  async query(sql: string): Promise<any[]> {
    await this.ensureToken();
    const r = await this.client.get(`/query?query=${encodeURIComponent(sql)}&minorversion=${this.minorVersion}`, this.headers);
    return r.data?.QueryResponse?.Invoice || r.data?.QueryResponse?.Customer || r.data?.QueryResponse?.Vendor || r.data?.QueryResponse?.SalesReceipt || [];
  }
  async create(entity: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${entity}?minorversion=${this.minorVersion}`, data, this.headers); return r.data?.[entity] || r.data; }
  async get(entity: string, id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/${entity}/${id}?minorversion=${this.minorVersion}`, this.headers); return r.data?.[entity] || r.data; }
  async update(entity: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${entity}?minorversion=${this.minorVersion}&operation=update`, data, this.headers); return r.data?.[entity] || r.data; }

  async healthCheck(): Promise<boolean> { try { const r = await this.client.get(`/companyinfo/${this.companyId}?minorversion=${this.minorVersion}`, this.headers); return r.ok; } catch { return false; } }
}

export function createQBEClient(config: ConnectionConfig): QBEClient {
  return new QBEClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.companyId || "", config.minorVersion);
}