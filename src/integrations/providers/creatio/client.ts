import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class CreatioClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any, siteUrl: string) {
    this.client = new HttpClient({ baseUrl: `${siteUrl.replace(/\/+$/, "")}/0/ServiceModel/EntityDataService.svc`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", Accept: "application/json", "ForceUseSession": "true" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshCreatioToken } = await import("./auth"); this.tokens = await refreshCreatioToken(this.authConfig, this.tokens.refreshToken); } }

  async list(entityName: string, filter?: string): Promise<any[]> {
    await this.ensureToken();
    const path = filter ? `/${entityName}?$filter=${encodeURIComponent(filter)}` : `/${entityName}`;
    const res = await this.client.get(path, this.headers);
    return res.data?.d?.results || res.data || [];
  }
  async create(entityName: string, data: any): Promise<any> {
    await this.ensureToken();
    const res = await this.client.post(`/${entityName}`, data, this.headers);
    return res.data;
  }
  async get(entityName: string, id: string): Promise<any> {
    await this.ensureToken();
    const res = await this.client.get(`/${entityName}(guid'${id}')`, this.headers);
    return res.data;
  }
  async update(entityName: string, id: string, data: any): Promise<void> {
    await this.ensureToken();
    await this.client.put(`/${entityName}(guid'${id}')`, data, this.headers);
  }
  async healthCheck(): Promise<boolean> {
    try { const res = await this.client.get("/Contact?$top=1", this.headers); return res.ok; } catch { return false; }
  }
}

export function createCreatioClient(config: ConnectionConfig): CreatioClient {
  return new CreatioClient(
    { accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "", siteUrl: config.siteUrl },
    config.siteUrl || "",
  );
}