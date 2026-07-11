import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class FreshBooksClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private accountId: string;
  constructor(tokens: OAuthTokens, authConfig: any, accountId: string) {
    this.client = new HttpClient({ baseUrl: `https://api.freshbooks.com/accounting/account/${accountId}`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.accountId = accountId;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", "Api-Version": "alpha" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshFBToken } = await import("./auth"); this.tokens = await refreshFBToken(this.authConfig, this.tokens.refreshToken); } }

  async list(entity: string, filter?: string): Promise<any[]> { await this.ensureToken(); const p = filter ? `/${entity}?${filter}` : `/${entity}?per_page=100`; const r = await this.client.get(p, this.headers); return r.data?.data || []; }
  async get(entity: string, id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/${entity}/${id}`, this.headers); return r.data; }
  async create(entity: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${entity}`, data, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/clients?per_page=1", this.headers); return r.ok; } catch { return false; } }
}

export function createFreshBooksClient(config: ConnectionConfig): FreshBooksClient {
  return new FreshBooksClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.accountId || "");
}