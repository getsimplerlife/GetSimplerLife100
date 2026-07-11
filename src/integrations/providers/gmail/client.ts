import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class GmailClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://gmail.googleapis.com/gmail/v1/users/me", rateLimit: { maxRequestsPerSecond: 25 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshGmailToken } = await import("./auth"); this.tokens = await refreshGmailToken(this.authConfig, this.tokens.refreshToken); } }

  async listMessages(q?: string, maxResults = 50): Promise<any[]> { await this.ensureToken(); const p = q ? `/messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}` : `/messages?maxResults=${maxResults}`; const r = await this.client.get(p, this.headers); return r.data?.messages || []; }
  async getMessage(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/messages/${id}`, this.headers); return r.data; }
  async getMessageFull(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/messages/${id}?format=full`, this.headers); return r.data; }
  async sendMessage(raw: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/messages/send", { raw }, this.headers); return r.data; }
  async listLabels(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/labels", this.headers); return r.data?.labels || []; }
  async modifyMessage(id: string, addLabels?: string[], removeLabels?: string[]): Promise<void> { await this.ensureToken(); await this.client.post(`/messages/${id}/modify`, { addLabelIds: addLabels, removeLabelIds: removeLabels }, this.headers); }
  async listThreads(q?: string, maxResults = 50): Promise<any[]> { await this.ensureToken(); const p = q ? `/threads?q=${encodeURIComponent(q)}&maxResults=${maxResults}` : `/threads?maxResults=${maxResults}`; const r = await this.client.get(p, this.headers); return r.data?.threads || []; }
  async getThread(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/threads/${id}`, this.headers); return r.data; }
  async getProfile(): Promise<any> { await this.ensureToken(); const r = await this.client.get("/profile", this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/profile", this.headers); return r.ok; } catch { return false; } }
}

export function createGmailClient(config: ConnectionConfig): GmailClient {
  return new GmailClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}