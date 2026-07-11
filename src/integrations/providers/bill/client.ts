import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class BillClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private devKey: string;
  constructor(tokens: OAuthTokens, authConfig: any, devKey: string) {
    this.client = new HttpClient({ baseUrl: "https://api.bill.com/api/v2", rateLimit: { maxRequestsPerSecond: 15 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.devKey = devKey;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", "X-API-Key": this.devKey }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshBillToken } = await import("./auth"); this.tokens = await refreshBillToken(this.authConfig, this.tokens.refreshToken); } }

  async list(entity: string, filter?: string): Promise<any[]> { await this.ensureToken(); const p = filter ? `/${entity}?${filter}` : `/${entity}?start=0&max=100`; const r = await this.client.get(p, this.headers); return r.data?.data || []; }
  async create(entity: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${entity}`, data, this.headers); return r.data; }
  async get(entity: string, id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/${entity}/${id}`, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/Vendor?start=0&max=1", this.headers); return r.ok; } catch { return false; } }
}

export function createBillClient(config: ConnectionConfig): BillClient {
  return new BillClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.devKey || "");
}