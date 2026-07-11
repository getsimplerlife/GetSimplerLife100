import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class GoogleWorkspaceClient {
  private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) { this.tokens = tokens; this.authConfig = authConfig; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshGWSToken } = await import("./auth"); this.tokens = await refreshGWSToken(this.authConfig, this.tokens.refreshToken); } }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async fetch(url: string, opts?: any): Promise<any> {
    await this.ensureToken();
    const r = await fetch(url, { headers: this.headers, ...opts });
    return r.json();
  }

  // Gmail
  async listMessages(q?: string, max = 50): Promise<any> { return this.fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}${q ? `&q=${encodeURIComponent(q)}` : ""}`); }
  async sendMessage(raw: string): Promise<any> { return this.fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw }) }); }
  // Calendar
  async listCalendars(): Promise<any> { return this.fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList"); }
  async listEvents(calendarId = "primary", max = 50): Promise<any> { return this.fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=${max}`); }
  // Drive
  async listFiles(q?: string): Promise<any> { return this.fetch(`https://www.googleapis.com/drive/v3/files${q ? `?q=${encodeURIComponent(q)}` : ""}`); }
  // Admin Directory
  async listUsers(domain?: string): Promise<any> { return this.fetch(`https://admin.googleapis.com/admin/directory/v1/users${domain ? `?domain=${domain}` : ""}`); }
  async listGroups(): Promise<any> { return this.fetch("https://admin.googleapis.com/admin/directory/v1/groups"); }

  async healthCheck(): Promise<boolean> { try { const r = await this.fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile"); return !!r.emailAddress; } catch { return false; } }
}

export function createGWSClient(config: ConnectionConfig): GoogleWorkspaceClient {
  return new GoogleWorkspaceClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}