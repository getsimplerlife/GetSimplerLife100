import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class SlackClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://slack.com/api", rateLimit: { maxRequestsPerSecond: 1 }, retry: { maxRetries: 3, baseDelay: 2000, maxDelay: 30000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json; charset=utf-8" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshSlackToken } = await import("./auth"); this.tokens = await refreshSlackToken(this.authConfig, this.tokens.refreshToken); } }

  async listConversations(types = "public_channel,private_channel"): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/conversations.list?types=${types}&limit=200`, this.headers); return r.data?.channels || []; }
  async getConversationHistory(channel: string, limit = 100): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/conversations.history?channel=${channel}&limit=${limit}`, this.headers); return r.data?.messages || []; }
  async postMessage(channel: string, text: string, options?: { blocks?: any[]; thread_ts?: string }): Promise<any> { await this.ensureToken(); const r = await this.client.post("/chat.postMessage", { channel, text, ...options }, this.headers); return r.data; }
  async postEphemeral(channel: string, user: string, text: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/chat.postEphemeral", { channel, user, text }, this.headers); return r.data; }
  async addReaction(channel: string, timestamp: string, reaction: string): Promise<void> { await this.ensureToken(); await this.client.post("/reactions.add", { channel, timestamp, name: reaction }, this.headers); }
  async getUsers(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/users.list?limit=200", this.headers); return r.data?.members || []; }
  async getUserInfo(user: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/users.info?user=${user}`, this.headers); return r.data?.user; }
  async searchMessages(query: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/search.messages?query=${encodeURIComponent(query)}`, this.headers); return r.data?.messages?.matches || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/api.test", this.headers); return r.data?.ok === true; } catch { return false; } }
}

export function createSlackClient(config: ConnectionConfig): SlackClient {
  return new SlackClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}