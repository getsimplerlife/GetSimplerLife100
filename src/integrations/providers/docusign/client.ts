import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class DocuSignClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private accountId: string; private baseUrl: string;
  constructor(tokens: OAuthTokens, authConfig: any, accountId: string, baseUrl: string) {
    this.baseUrl = baseUrl || "https://demo.docusign.net/restapi"; this.client = new HttpClient({ baseUrl: `${this.baseUrl}/v2.1/accounts/${accountId}`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.accountId = accountId;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshDocuSignToken } = await import("./auth"); this.tokens = await refreshDocuSignToken(this.authConfig, this.tokens.refreshToken); } }

  async listEnvelopes(fromDate?: string): Promise<any[]> { await this.ensureToken(); const p = fromDate ? `/envelopes?from_date=${fromDate}` : "/envelopes?from_date=2020-01-01"; const r = await this.client.get(p, this.headers); return r.data?.envelopes || []; }
  async sendEnvelope(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/envelopes", data, this.headers); return r.data; }
  async getEnvelope(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/envelopes/${id}`, this.headers); return r.data; }
  async listRecipients(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/envelopes/${id}/recipients`, this.headers); return r.data; }
  async listTemplates(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/templates", this.headers); return r.data?.envelopeTemplates || []; }
  async getEnvelopeDocuments(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/envelopes/${id}/documents`, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/envelopes?from_date=2020-01-01&count=1", this.headers); return r.ok; } catch { return false; } }
}

export function createDocuSignClient(config: ConnectionConfig): DocuSignClient {
  return new DocuSignClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.accountId || "", config.baseUrl || "");
}