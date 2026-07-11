import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";

interface ZohoRecord { id?: string; [key: string]: any; }
interface ZohoResponse<T> { data?: T[]; info?: { count: number; moreRecords: boolean }; }

export class ZohoClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;

  constructor(tokens: OAuthTokens, authConfig: any, apiDomain: string) {
    this.client = new HttpClient({ baseUrl: `${apiDomain}/crm/v6`, rateLimit: { maxRequestsPerSecond: 7 }, retry: { maxRetries: 3, baseDelay: 2000, maxDelay: 30000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }

  private get authHeaders() { return { Authorization: `Zoho-oauthtoken ${this.tokens.accessToken}` }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshZohoToken } = await import("./auth"); this.tokens = await refreshZohoToken(this.authConfig, this.tokens.refreshToken); } }

  async search(module: string, criteria: string): Promise<ZohoRecord[]> {
    await this.ensureToken();
    const res = await this.client.get<ZohoResponse<ZohoRecord>>(`/${module}?criteria=(${encodeURIComponent(criteria)})`, this.authHeaders);
    return res.data?.data || [];
  }
  async create(module: string, data: any): Promise<string> {
    await this.ensureToken();
    const res = await this.client.post<{ data: { id: string; status: string }[] }>(`/${module}`, { data: [data] }, this.authHeaders);
    return res.data.data[0]?.id || "";
  }
  async get(module: string, id: string): Promise<ZohoRecord> {
    await this.ensureToken();
    const res = await this.client.get<ZohoResponse<ZohoRecord>>(`/${module}/${id}`, this.authHeaders);
    return res.data?.data?.[0] || {};
  }

  async searchContacts(query: string) { return this.search("Contacts", `(Email:equals:${query})`); }
  async createContact(data: any) { return this.create("Contacts", data); }
  async searchAccounts(query: string) { return this.search("Accounts", `(Account_Name:equals:${query})`); }
  async createAccount(data: any) { return this.create("Accounts", data); }
  async searchDeals(query: string) { return this.search("Deals", `(Deal_Name:contains:${query})`); }
  async createDeal(data: any) { return this.create("Deals", data); }
  async searchLeads(query: string) { return this.search("Leads", `(Email:equals:${query})`); }
  async createLead(data: any) { return this.create("Leads", data); }

  async healthCheck(): Promise<boolean> {
    try { const res = await this.client.get("/Contacts?per_page=1", this.authHeaders); return res.ok; } catch { return false; }
  }
}

export function createZohoClient(config: ConnectionConfig): ZohoClient {
  return new ZohoClient(
    { accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "", accountsDomain: config.accountsDomain },
    config.apiDomain || "https://www.zohoapis.com",
  );
}