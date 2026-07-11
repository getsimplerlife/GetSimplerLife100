import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class SugarClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any, siteUrl: string) {
    this.client = new HttpClient({ baseUrl: `${siteUrl.replace(/\/+$/, "")}/rest/v11`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { "OAuth-Token": this.tokens.accessToken, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshSugarToken } = await import("./auth"); this.tokens = await refreshSugarToken(this.authConfig, this.tokens.refreshToken); } }

  async get(module: string, id?: string): Promise<any> {
    await this.ensureToken();
    const path = id ? `/${module}/${id}` : `/${module}`;
    const res = await this.client.get(path, this.headers);
    return res.data;
  }
  async list(module: string, filter?: string): Promise<any> {
    await this.ensureToken();
    const path = filter ? `/${module}?filter=[${filter}]` : `/${module}`;
    const res = await this.client.get(path, this.headers);
    return res.data;
  }
  async create(module: string, data: any): Promise<string> {
    await this.ensureToken();
    const res = await this.client.post<{ id: string }>(`/${module}`, data, this.headers);
    return res.data.id;
  }
  async update(module: string, id: string, data: any): Promise<void> {
    await this.ensureToken();
    await this.client.put(`/${module}/${id}`, data, this.headers);
  }
  async healthCheck(): Promise<boolean> {
    try { const res = await this.client.get("/me", this.headers); return res.ok; } catch { return false; }
  }
}

export function createSugarClient(config: ConnectionConfig): SugarClient {
  return new SugarClient(
    { accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "", siteUrl: config.siteUrl },
    config.siteUrl || "",
  );
}