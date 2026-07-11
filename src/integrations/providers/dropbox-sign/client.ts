import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class HSClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.hellosign.com/v3", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshHSToken } = await import("./auth"); this.tokens = await refreshHSToken(this.authConfig, this.tokens.refreshToken); } }

  async listSignatureRequests(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/signature_request/list", this.headers); return r.data?.signature_requests || []; }
  async sendSignatureRequest(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/signature_request/send", data, this.headers); return r.data; }
  async getSignatureRequest(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/signature_request/${id}`, this.headers); return r.data; }
  async listTemplates(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/template/list", this.headers); return r.data?.templates || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/account", this.headers); return r.ok; } catch { return false; } }
}

export function createHSClient(config: ConnectionConfig): HSClient {
  return new HSClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}