import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class WebexClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://webexapis.com/v1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshWebexToken } = await import("./auth"); this.tokens = await refreshWebexToken(this.authConfig, this.tokens.refreshToken); } }

  async listRooms(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/rooms?max=100", this.headers); return r.data?.items || []; }
  async createRoom(title: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/rooms", { title }, this.headers); return r.data; }
  async listMessages(roomId: string, max = 50): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/messages?roomId=${roomId}&max=${max}`, this.headers); return r.data?.items || []; }
  async postMessage(roomId: string, text: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/messages", { roomId, text }, this.headers); return r.data; }
  async listMemberships(roomId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/memberships?roomId=${roomId}`, this.headers); return r.data?.items || []; }
  async listPeople(email?: string): Promise<any[]> { await this.ensureToken(); const p = email ? `/people?email=${encodeURIComponent(email)}` : "/people?max=100"; const r = await this.client.get(p, this.headers); return r.data?.items || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/people/me", this.headers); return r.ok; } catch { return false; } }
}

export function createWebexClient(config: ConnectionConfig): WebexClient {
  return new WebexClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}