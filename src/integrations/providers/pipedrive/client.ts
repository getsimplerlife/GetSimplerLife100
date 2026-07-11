import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

interface PdPerson { id?: number; name: string; email?: string; phone?: string; organization_id?: number; [key: string]: any; }
interface PdDeal { id?: number; title: string; value?: number; currency?: string; status?: string; stage_id?: number; person_id?: number; org_id?: number; [key: string]: any; }
interface PdOrg { id?: number; name: string; [key: string]: any; }

export class PipedriveClient {
  private client: HttpClient; private tokens: OAuthTokens;

  constructor(tokens: OAuthTokens) {
    this.client = new HttpClient({ baseUrl: "https://api.pipedrive.com/v1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens;
  }
  private get authHeaders() { return { Authorization: `Bearer ${this.tokens.accessToken}` }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshPipedriveToken } = await import("./auth"); this.tokens = await refreshPipedriveToken({ clientId: "", clientSecret: "", redirectUri: "" }, this.tokens.refreshToken); } }

  async searchPersons(query: string): Promise<PdPerson[]> {
    await this.ensureToken();
    const res = await this.client.get<{ data: PdPerson[] }>(`/persons/search?term=${encodeURIComponent(query)}&limit=50`, this.authHeaders);
    return res.data?.data || [];
  }
  async createPerson(data: any): Promise<number> {
    await this.ensureToken();
    const res = await this.client.post<{ data: PdPerson }>("/persons", data, this.authHeaders);
    return res.data.data.id!;
  }
  async getPerson(id: number): Promise<PdPerson> {
    await this.ensureToken();
    const res = await this.client.get<{ data: PdPerson }>(`/persons/${id}`, this.authHeaders);
    return res.data.data;
  }
  async searchDeals(query: string): Promise<PdDeal[]> {
    await this.ensureToken();
    const res = await this.client.get<{ data: PdDeal[] }>(`/deals/search?term=${encodeURIComponent(query)}&limit=50`, this.authHeaders);
    return res.data?.data || [];
  }
  async createDeal(data: any): Promise<number> {
    await this.ensureToken();
    const res = await this.client.post<{ data: PdDeal }>("/deals", data, this.authHeaders);
    return res.data.data.id!;
  }
  async getDeal(id: number): Promise<PdDeal> {
    await this.ensureToken();
    const res = await this.client.get<{ data: PdDeal }>(`/deals/${id}`, this.authHeaders);
    return res.data.data;
  }
  async getDealStages(): Promise<any[]> {
    await this.ensureToken();
    const res = await this.client.get<{ data: any[] }>("/stages", this.authHeaders);
    return res.data?.data || [];
  }
  async healthCheck(): Promise<boolean> {
    try { const res = await this.client.get("/users/me", this.authHeaders); return res.ok; } catch { return false; }
  }
}

export function createPipedriveClient(config: ConnectionConfig): PipedriveClient {
  return new PipedriveClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config });
}