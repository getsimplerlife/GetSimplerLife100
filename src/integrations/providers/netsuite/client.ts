import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

interface NSRecord { id?: string; [key: string]: any; }

export class NetSuiteClient {
  private client: HttpClient; private tokens: OAuthTokens; private accountId: string;
  constructor(tokens: OAuthTokens, accountId: string) {
    this.client = new HttpClient({ baseUrl: `https://${accountId}.suitetalk.api.netsuite.com/services/rest/record/v1`, rateLimit: { maxRequestsPerSecond: 25 }, retry: { maxRetries: 3, baseDelay: 2000, maxDelay: 30000 }, timeout: 45000 });
    this.tokens = tokens; this.accountId = accountId;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", Prefer: "transient" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshNetSuiteToken } = await import("./auth"); this.tokens = await refreshNetSuiteToken({ clientId: "", clientSecret: "", redirectUri: "", accountId: this.accountId }, this.tokens.refreshToken); } }

  async get(entity: string, id: string): Promise<NSRecord> { await this.ensureToken(); const r = await this.client.get(`/${entity}/${id}`, this.headers); return r.data; }
  async list(entity: string, q?: string): Promise<NSRecord[]> {
    await this.ensureToken();
    const r = await this.client.get<{ items: NSRecord[] }>(`/${entity}${q ? `?q=${encodeURIComponent(q)}` : ""}`, this.headers);
    return r.data?.items || [];
  }
  async create(entity: string, data: any): Promise<string> { await this.ensureToken(); const r = await this.client.post<{ id: string }>(`/${entity}`, data, this.headers); return r.data.id; }
  async update(entity: string, id: string, data: any): Promise<void> { await this.ensureToken(); await this.client.patch(`/${entity}/${id}`, data, this.headers); }
  async upsert(entity: string, id: string, data: any): Promise<void> { await this.ensureToken(); await this.client.put(`/${entity}/${id}`, data, this.headers); }
  async delete(entity: string, id: string): Promise<void> { await this.ensureToken(); await this.client.delete(`/${entity}/${id}`, this.headers); }
  async query(savedSearchId: string): Promise<NSRecord[]> {
    await this.ensureToken();
    const r = await this.client.post<{ items: NSRecord[] }>(`https://${this.accountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`, { q: `SELECT * FROM savedSearch WHERE id = '${savedSearchId}'` }, { ...this.headers, "Content-Type": "application/json" });
    return r.data?.items || [];
  }
  async runSuiteQL(query: string): Promise<NSRecord[]> {
    await this.ensureToken();
    const r = await this.client.post<{ items: NSRecord[] }>(`https://${this.accountId}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`, { q: query }, { ...this.headers, "Content-Type": "application/json" });
    return r.data?.items || [];
  }

  async healthCheck(): Promise<boolean> {
    try { const r = await this.client.get("/customer?limit=1", this.headers); return r.ok; } catch { return false; }
  }
}

export function createNetSuiteClient(config: ConnectionConfig): NetSuiteClient {
  return new NetSuiteClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config }, config.accountId || "");
}