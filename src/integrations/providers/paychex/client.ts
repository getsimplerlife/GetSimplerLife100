import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class PaychexClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.paychex.com/v1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshPaychexToken } = await import("./auth"); this.tokens = await refreshPaychexToken(this.authConfig, this.tokens.refreshToken); } }

  async listWorkers(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/workers", this.headers); return r.data?.results || []; }
  async getWorker(workerId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/workers/${workerId}`, this.headers); return r.data; }
  async createWorker(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/workers", data, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/workers?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createPaychexClient(config: ConnectionConfig): PaychexClient {
  return new PaychexClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}