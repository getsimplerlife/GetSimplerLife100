import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class ADPClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.adp.com/hr/v2", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshADPToken } = await import("./auth"); this.tokens = await refreshADPToken(this.authConfig, this.tokens.refreshToken); } }

  async listWorkers(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/workers", this.headers); return r.data?.workers || []; }
  async getWorker(associateOID: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/workers/${associateOID}`, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/workers?$top=1", this.headers); return r.ok; } catch { return false; } }
}

export function createADPClient(config: ConnectionConfig): ADPClient {
  return new ADPClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}