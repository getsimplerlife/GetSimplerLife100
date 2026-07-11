import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class TeamsClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://graph.microsoft.com/v1.0", rateLimit: { maxRequestsPerSecond: 30 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshTeamsToken } = await import("./auth"); this.tokens = await refreshTeamsToken(this.authConfig, this.tokens.refreshToken); } }

  async listTeams(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/me/joinedTeams", this.headers); return r.data?.value || []; }
  async listChannels(teamId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/teams/${teamId}/channels`, this.headers); return r.data?.value || []; }
  async getChannelMessages(teamId: string, channelId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/teams/${teamId}/channels/${channelId}/messages`, this.headers); return r.data?.value || []; }
  async sendChannelMessage(teamId: string, channelId: string, content: string): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/teams/${teamId}/channels/${channelId}/messages`, { body: { content } }, this.headers); return r.data; }
  async listChats(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/me/chats", this.headers); return r.data?.value || []; }
  async getChatMessages(chatId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/me/chats/${chatId}/messages`, this.headers); return r.data?.value || []; }
  async sendChatMessage(chatId: string, content: string): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/me/chats/${chatId}/messages`, { body: { content } }, this.headers); return r.data; }
  async getPresence(userId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/users/${userId}/presence`, this.headers); return r.data; }
  async createMeeting(subject: string, startDateTime: string, endDateTime: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/me/onlineMeetings", { subject, startDateTime, endDateTime }, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/me", this.headers); return r.ok; } catch { return false; } }
}

export function createTeamsClient(config: ConnectionConfig): TeamsClient {
  return new TeamsClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { tenantId: config.tenantId || "", clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}