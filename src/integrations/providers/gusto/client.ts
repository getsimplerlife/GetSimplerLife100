import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class GustoClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.gusto.com/v1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", Accept: "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshGustoToken } = await import("./auth"); this.tokens = await refreshGustoToken(this.authConfig, this.tokens.refreshToken); } }

  async listCompanies(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/companies", this.headers); return r.data || []; }
  async getCompany(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/companies/${id}`, this.headers); return r.data; }
  async listEmployees(companyId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/companies/${companyId}/employees`, this.headers); return r.data || []; }
  async createEmployee(companyId: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/companies/${companyId}/employees`, data, this.headers); return r.data; }
  async listContractors(companyId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/companies/${companyId}/contractors`, this.headers); return r.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/companies", this.headers); return r.ok; } catch { return false; } }
}

export function createGustoClient(config: ConnectionConfig): GustoClient {
  return new GustoClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}