import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class UKGClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.ukg.com/v1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshUKGToken } = await import("./auth"); this.tokens = await refreshUKGToken(this.authConfig, this.tokens.refreshToken); } }

  async listEmployees(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/employees", this.headers); return r.data?.data || []; }
  async getEmployee(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/employees/${id}`, this.headers); return r.data; }
  async listTimeEntries(employeeId: string, from: string, to: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/employees/${employeeId}/time?from=${from}&to=${to}`, this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/employees?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createUKGClient(config: ConnectionConfig): UKGClient {
  return new UKGClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}