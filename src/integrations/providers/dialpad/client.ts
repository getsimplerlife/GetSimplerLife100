import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class DialpadClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.dialpad.com/v2", rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshDialpadToken } = await import("./auth"); this.tokens = await refreshDialpadToken(this.authConfig, this.tokens.refreshToken); } }

  async getMe(): Promise<any> { await this.ensureToken(); const r = await this.client.get("/user/me", this.headers); return r.data; }
  async listUsers(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/users?limit=100", this.headers); return r.data?.data || []; }
  async listCallLogs(limit = 50): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/calls?limit=${limit}`, this.headers); return r.data?.data || []; }
  async getCall(callId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/calls/${callId}`, this.headers); return r.data; }
  async sendSMS(to: string, text: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/sms", { to_number: to, text }, this.headers); return r.data; }
  async listSMS(limit = 50): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/sms?limit=${limit}`, this.headers); return r.data?.data || []; }
  async listContacts(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/contacts?limit=100", this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/user/me", this.headers); return r.ok; } catch { return false; } }
}

export function createDialpadClient(config: ConnectionConfig): DialpadClient {
  return new DialpadClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}