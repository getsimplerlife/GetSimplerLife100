import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class OutlookClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://graph.microsoft.com/v1.0/me", rateLimit: { maxRequestsPerSecond: 30 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshOutlookToken } = await import("./auth"); this.tokens = await refreshOutlookToken(this.authConfig, this.tokens.refreshToken); } }

  async listMessages(folder?: string, top = 50): Promise<any[]> { await this.ensureToken(); const p = folder ? `/mailFolders/${folder}/messages?$top=${top}` : `/messages?$top=${top}`; const r = await this.client.get(p, this.headers); return r.data?.value || []; }
  async getMessage(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/messages/${id}`, this.headers); return r.data; }
  async sendMessage(data: any): Promise<void> { await this.ensureToken(); await this.client.post("/sendMail", data, this.headers); }
  async createDraft(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/messages", data, this.headers); return r.data; }
  async replyToMessage(id: string, comment: string): Promise<void> { await this.ensureToken(); await this.client.post(`/messages/${id}/reply`, { comment }, this.headers); }
  async listFolders(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/mailFolders", this.headers); return r.data?.value || []; }
  async searchMessages(query: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/messages?$search="${encodeURIComponent(query)}"`, this.headers); return r.data?.value || []; }
  async listCalendars(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/calendars", this.headers); return r.data?.value || []; }
  async listEvents(calendarId?: string, top = 50): Promise<any[]> { await this.ensureToken(); const p = calendarId ? `/calendars/${calendarId}/events?$top=${top}` : `/events?$top=${top}`; const r = await this.client.get(p, this.headers); return r.data?.value || []; }
  async listContacts(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/contacts", this.headers); return r.data?.value || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/", this.headers); return r.ok; } catch { return false; } }
}

export function createOutlookClient(config: ConnectionConfig): OutlookClient {
  return new OutlookClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { tenantId: config.tenantId || "", clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}