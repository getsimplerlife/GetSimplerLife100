import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class ZoomClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.zoom.us/v2", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshZoomToken } = await import("./auth"); this.tokens = await refreshZoomToken(this.authConfig, this.tokens.refreshToken); } }

  async listUsers(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/users?status=active&page_size=100", this.headers); return r.data?.users || []; }
  async getUser(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/users/${id}`, this.headers); return r.data; }
  async createMeeting(userId: string, topic: string, type: number, startTime?: string, duration?: number): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/users/${userId}/meetings`, { topic, type, start_time: startTime, duration }, this.headers); return r.data; }
  async listMeetings(userId: string, type = "scheduled"): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/users/${userId}/meetings?type=${type}`, this.headers); return r.data?.meetings || []; }
  async getMeeting(meetingId: number): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/meetings/${meetingId}`, this.headers); return r.data; }
  async listRecordings(userId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/users/${userId}/recordings`, this.headers); return r.data?.meetings || []; }
  // Zoom Phone
  async listPhoneCallLogs(userId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/phone/users/${userId}/call_logs`, this.headers); return r.data?.call_logs || []; }
  async listPhoneVoicemails(userId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/phone/users/${userId}/voicemails`, this.headers); return r.data?.voicemails || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/users?page_size=1", this.headers); return r.ok; } catch { return false; } }
}

export function createZoomClient(config: ConnectionConfig): ZoomClient {
  return new ZoomClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}