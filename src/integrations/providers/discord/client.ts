import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class DiscordClient {
  private client: HttpClient; private botToken: string;
  constructor(botToken: string) {
    this.client = new HttpClient({ baseUrl: "https://discord.com/api/v10", rateLimit: { maxRequestsPerSecond: 50 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.botToken = botToken;
  }
  private get headers() { return { Authorization: `Bot ${this.botToken}`, "Content-Type": "application/json", "User-Agent": "SimplerLife100/1.0" }; }

  async getCurrentUser(): Promise<any> { const r = await this.client.get("/users/@me", this.headers); return r.data; }
  async listGuilds(): Promise<any[]> { const r = await this.client.get("/users/@me/guilds", this.headers); return r.data || []; }
  async listChannels(guildId: string): Promise<any[]> { const r = await this.client.get(`/guilds/${guildId}/channels`, this.headers); return r.data || []; }
  async getChannel(channelId: string): Promise<any> { const r = await this.client.get(`/channels/${channelId}`, this.headers); return r.data; }
  async listMessages(channelId: string, limit = 50): Promise<any[]> { const r = await this.client.get(`/channels/${channelId}/messages?limit=${limit}`, this.headers); return r.data || []; }
  async sendMessage(channelId: string, content: string, embeds?: any[]): Promise<any> { const r = await this.client.post(`/channels/${channelId}/messages`, { content, embeds }, this.headers); return r.data; }
  async editMessage(channelId: string, messageId: string, content: string): Promise<any> { const r = await this.client.patch(`/channels/${channelId}/messages/${messageId}`, { content }, this.headers); return r.data; }
  async deleteMessage(channelId: string, messageId: string): Promise<void> { await this.client.delete(`/channels/${channelId}/messages/${messageId}`, this.headers); }
  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> { await this.client.put(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`, undefined, this.headers); }
  async listGuildMembers(guildId: string, limit = 100): Promise<any[]> { const r = await this.client.get(`/guilds/${guildId}/members?limit=${limit}`, this.headers); return r.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/users/@me", this.headers); return r.ok; } catch { return false; } }
}

export function createDiscordClient(config: ConnectionConfig): DiscordClient {
  return new DiscordClient(config.botToken || "");
}