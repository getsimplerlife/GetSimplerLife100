/**
 * HubSpot Integration — Client
 */
import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";

export interface HubSpotContact {
  id?: string;
  properties: {
    firstname?: string;
    lastname: string;
    email?: string;
    phone?: string;
    jobtitle?: string;
    company?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    hs_object_id?: string;
    createdate?: string;
    lastmodifieddate?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface HubSpotCompany {
  id?: string;
  properties: {
    name: string;
    domain?: string;
    industry?: string;
    website?: string;
    phone?: string;
    city?: string;
    state?: string;
    country?: string;
    numberofemployees?: number;
    annualrevenue?: number;
    hs_object_id?: string;
    createdate?: string;
  };
}

export interface HubSpotDeal {
  id?: string;
  properties: {
    dealname: string;
    dealstage?: string;
    pipeline?: string;
    amount?: number;
    closedate?: string;
    dealtype?: string;
    hs_object_id?: string;
    createdate?: string;
  };
}

export interface HubSpotOwner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface HubSpotSearchResult<T> {
  total: number;
  results: T[];
}

export class HubSpotClient {
  private client: HttpClient;
  private tokens: OAuthTokens;
  private authConfig: { clientId: string; clientSecret: string; redirectUri: string };

  constructor(tokens: OAuthTokens, authConfig: { clientId: string; clientSecret: string; redirectUri: string }) {
    this.client = new HttpClient({
      baseUrl: "https://api.hubapi.com",
      rateLimit: { maxRequestsPerSecond: 100 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
    this.tokens = tokens;
    this.authConfig = authConfig;
  }

  private get authHeaders() {
    return { Authorization: `Bearer ${this.tokens.accessToken}` };
  }

  private async ensureToken() {
    if (isTokenExpired(this.tokens) && this.tokens.refreshToken) {
      const { refreshHubSpotToken } = await import("./auth");
      this.tokens = await refreshHubSpotToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  private async search(entity: string, filterGroups: any[], properties: string[], limit = 50): Promise<HubSpotSearchResult<any>> {
    await this.ensureToken();
    // HubSpot rejects empty CONTAINS_TOKEN filter values; use no filters to list all records.
    const body: Record<string, unknown> = { properties, limit };
    if (filterGroups.length > 0) body.filterGroups = filterGroups;
    const res = await this.client.post(
      `/crm/v3/objects/${entity}/search`,
      body,
      this.authHeaders,
    );
    return res.data;
  }

  async searchContacts(query: string): Promise<HubSpotSearchResult<HubSpotContact>> {
    return this.search("contacts", query ? [{ filters: [{ propertyName: "email", operator: "CONTAINS_TOKEN", value: query }] }] : [], ["firstname", "lastname", "email", "phone", "jobtitle", "company", "hs_object_id"]);
  }

  async createContact(data: Partial<HubSpotContact["properties"]>): Promise<string> {
    await this.ensureToken();
    const res = await this.client.post<{ id: string }>("/crm/v3/objects/contacts", { properties: data }, this.authHeaders);
    return res.data.id;
  }

  async getContact(id: string): Promise<HubSpotContact> {
    await this.ensureToken();
    const res = await this.client.get<HubSpotContact>(`/crm/v3/objects/contacts/${id}`, this.authHeaders);
    return res.data;
  }

  async searchCompanies(query: string): Promise<HubSpotSearchResult<HubSpotCompany>> {
    return this.search("companies", query ? [{ filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: query }] }] : [], ["name", "domain", "industry", "phone", "city", "state", "country", "hs_object_id"]);
  }

  async createCompany(data: Partial<HubSpotCompany["properties"]>): Promise<string> {
    await this.ensureToken();
    const res = await this.client.post<{ id: string }>("/crm/v3/objects/companies", { properties: data }, this.authHeaders);
    return res.data.id;
  }

  async getCompany(id: string): Promise<HubSpotCompany> {
    await this.ensureToken();
    const res = await this.client.get<HubSpotCompany>(`/crm/v3/objects/companies/${id}`, this.authHeaders);
    return res.data;
  }

  async searchDeals(query: string): Promise<HubSpotSearchResult<HubSpotDeal>> {
    return this.search("deals", query ? [{ filters: [{ propertyName: "dealname", operator: "CONTAINS_TOKEN", value: query }] }] : [], ["dealname", "dealstage", "pipeline", "amount", "closedate", "dealtype", "hs_object_id"]);
  }

  async createDeal(data: Partial<HubSpotDeal["properties"]>): Promise<string> {
    await this.ensureToken();
    const res = await this.client.post<{ id: string }>("/crm/v3/objects/deals", { properties: data }, this.authHeaders);
    return res.data.id;
  }

  async getDeal(id: string): Promise<HubSpotDeal> {
    await this.ensureToken();
    const res = await this.client.get<HubSpotDeal>(`/crm/v3/objects/deals/${id}`, this.authHeaders);
    return res.data;
  }

  async getOwners(): Promise<HubSpotOwner[]> {
    await this.ensureToken();
    const res = await this.client.get<{ results: HubSpotOwner[] }>("/crm/v3/owners", this.authHeaders);
    return res.data.results;
  }

  async getPipelineStages(): Promise<any[]> {
    await this.ensureToken();
    const res = await this.client.get<{ results: any[] }>("/crm/v3/pipelines/deals", this.authHeaders);
    return res.data.results;
  }

  async searchTickets(query: string): Promise<HubSpotSearchResult<any>> {
    return this.search("tickets", query ? [{ filters: [{ propertyName: "subject", operator: "CONTAINS_TOKEN", value: query }] }] : [], ["subject", "content", "hs_pipeline", "hs_pipeline_stage", "createdate", "hs_object_id"]);
  }

  async updateDeal(id: string, data: Partial<HubSpotDeal["properties"]>): Promise<void> {
    await this.ensureToken();
    const res = await this.client.patch(`/crm/v3/objects/deals/${id}`, { properties: data }, this.authHeaders);
    if (!res.ok) throw new Error(`HubSpot updateDeal failed HTTP ${res.status}`);
  }

  async updateContact(id: string, data: Partial<HubSpotContact["properties"]>): Promise<void> {
    await this.ensureToken();
    const res = await this.client.patch(`/crm/v3/objects/contacts/${id}`, { properties: data }, this.authHeaders);
    if (!res.ok) throw new Error(`HubSpot updateContact failed HTTP ${res.status}`);
  }

  async deleteObject(kind: "contacts" | "deals" | "companies", id: string): Promise<void> {
    await this.ensureToken();
    const res = await this.client.delete(`/crm/v3/objects/${kind}/${id}`, this.authHeaders);
    if (!res.ok && res.status !== 404) throw new Error(`HubSpot delete ${kind}/${id} failed HTTP ${res.status}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.client.get("/crm/v3/objects/contacts?limit=1", this.authHeaders);
      return res.ok;
    } catch { return false; }
  }
}

export function createHubSpotClient(config: ConnectionConfig): HubSpotClient {
  return new HubSpotClient(
    { accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
  );
}