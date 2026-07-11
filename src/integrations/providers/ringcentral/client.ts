import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class RingCentralClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~", rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshRCToken } = await import("./auth"); this.tokens = await refreshRCToken(this.authConfig, this.tokens.refreshToken); } }

  async listCallLogs(dateFrom?: string, dateTo?: string): Promise<any[]> { await this.ensureToken(); const p = dateFrom ? `?dateFrom=${dateFrom}${dateTo ? `&dateTo=${dateTo}` : ""}` : ""; const r = await this.client.get(`/call-log${p}`, this.headers); return r.data?.records || []; }
  async sendSMS(to: string, text: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/sms", { to: [{ phoneNumber: to }], text }, this.headers); return r.data; }
  async listMessages(type?: string): Promise<any[]> { await this.ensureToken(); const p = type ? `?messageType=${type}` : ""; const r = await this.client.get(`/message-store${p}`, this.headers); return r.data?.records || []; }
  async getExtension(): Promise<any> { await this.ensureToken(); const r = await this.client.get("", this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("", this.headers); return r.ok; } catch { return false; } }
}

export function createRCClient(config: ConnectionConfig): RingCentralClient {
  return new RingCentralClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "", serverUrl: config.serverUrl });
}