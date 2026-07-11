import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class SmartsheetClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.smartsheet.com/2.0", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshSsheetToken } = await import("./auth"); this.tokens = await refreshSsheetToken(this.authConfig, this.tokens.refreshToken); } }

  async listSheets(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/sheets", this.headers); return r.data?.data || []; }
  async getSheet(sheetId: number): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/sheets/${sheetId}`, this.headers); return r.data; }
  async addRows(sheetId: number, rows: any[]): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/sheets/${sheetId}/rows`, rows, this.headers); return r.data; }
  async updateRow(sheetId: number, rowId: number, cells: any[]): Promise<any> { await this.ensureToken(); const r = await this.client.put(`/sheets/${sheetId}/rows/${rowId}`, { cells }, this.headers); return r.data; }
  async listReports(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/reports", this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/sheets?include=ownerInfo&pageSize=1", this.headers); return r.ok; } catch { return false; } }
}

export function createSmartsheetClient(config: ConnectionConfig): SmartsheetClient {
  return new SmartsheetClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}