/**
 * Salesforce Integration — Client
 *
 * Typed API client for Salesforce REST API (v62.0).
 * Supports CRUD for standard objects: Contacts, Accounts, Leads, Opportunities, Tasks.
 */

import { HttpClient, HttpClientError, RateLimitError } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";

export interface SalesforceContact {
  Id?: string;
  FirstName?: string;
  LastName: string;
  Email?: string;
  Phone?: string;
  Title?: string;
  AccountId?: string;
  MailingStreet?: string;
  MailingCity?: string;
  MailingState?: string;
  MailingPostalCode?: string;
  MailingCountry?: string;
  OwnerId?: string;
  CreatedDate?: string;
  LastModifiedDate?: string;
}

export interface SalesforceAccount {
  Id?: string;
  Name: string;
  Type?: string;
  Industry?: string;
  Phone?: string;
  Website?: string;
  BillingStreet?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingPostalCode?: string;
  BillingCountry?: string;
  OwnerId?: string;
  CreatedDate?: string;
  LastModifiedDate?: string;
}

export interface SalesforceLead {
  Id?: string;
  FirstName?: string;
  LastName: string;
  Company: string;
  Title?: string;
  Email?: string;
  Phone?: string;
  Status?: string;
  Source?: string;
  OwnerId?: string;
  CreatedDate?: string;
  LastModifiedDate?: string;
}

export interface SalesforceOpportunity {
  Id?: string;
  Name: string;
  StageName: string;
  CloseDate: string;
  Amount?: number;
  Probability?: number;
  Type?: string;
  LeadSource?: string;
  AccountId?: string;
  OwnerId?: string;
  CreatedDate?: string;
  LastModifiedDate?: string;
  Pipeline?: string;
}

export interface SalesforceTask {
  Id?: string;
  Subject: string;
  Status?: string;
  Priority?: string;
  Description?: string;
  ActivityDate?: string;
  WhoId?: string;
  WhatId?: string;
  OwnerId?: string;
  CreatedDate?: string;
}

export interface QueryResult<T> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

export interface SalesforceUserInfo {
  id: string;
  organization_id: string;
  username: string;
  display_name: string;
  email: string;
}

export class SalesforceClient {
  private client: HttpClient;
  private tokens: OAuthTokens;
  private authConfig: { clientId: string; clientSecret: string; isSandbox?: boolean };

  constructor(
    tokens: OAuthTokens,
    authConfig: { clientId: string; clientSecret: string; isSandbox?: boolean },
  ) {
    const baseUrl = (tokens.instanceUrl || "https://login.salesforce.com").replace(/\/+$/, "");
    this.client = new HttpClient({
      baseUrl: `${baseUrl}/services/data/v62.0`,
      rateLimit: { maxRequestsPerSecond: 10 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 15000 },
      timeout: 30000,
    });
    this.tokens = tokens;
    this.authConfig = authConfig;
  }

  private get authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.tokens.accessToken}` };
  }

  private async ensureToken(): Promise<void> {
    if (isTokenExpired(this.tokens) && this.tokens.refreshToken) {
      const { refreshSalesforceToken } = await import("./auth");
      this.tokens = await refreshSalesforceToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  // ── Identity ────────────────────────────────────────────────────────────

  async getUserInfo(): Promise<SalesforceUserInfo> {
    await this.ensureToken();
    const baseUrl = this.tokens.instanceUrl?.replace(/\/+$/, "") || "";
    const res = await this.client.get<SalesforceUserInfo>("/", this.authHeaders);
    // Identity is at the base API endpoint
    const idRes = await fetch(`${baseUrl}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${this.tokens.accessToken}` },
    });
    return idRes.json();
  }

  // ── SOQL Query ──────────────────────────────────────────────────────────

  async query<T = any>(soql: string): Promise<QueryResult<T>> {
    await this.ensureToken();
    return this.client
      .get<QueryResult<T>>(`/query?q=${encodeURIComponent(soql)}`, this.authHeaders)
      .then((r) => r.data);
  }

  async queryAll<T = any>(soql: string): Promise<T[]> {
    let results: T[] = [];
    let queryLocator: string | undefined;
    do {
      const url = queryLocator
        ? `/query/${encodeURIComponent(queryLocator)}`
        : `/query?q=${encodeURIComponent(soql)}`;
      const res = await this.client
        .get<QueryResult<T>>(url, this.authHeaders)
        .then((r) => r.data);
      results = results.concat(res.records);
      queryLocator = res.nextRecordsUrl?.split("/").pop();
    } while (queryLocator);
    return results;
  }

  // ── SObject CRUD ────────────────────────────────────────────────────────

  async create(sobject: string, data: Record<string, any>): Promise<string> {
    await this.ensureToken();
    const res = await this.client.post<{ id: string; success: boolean; errors: string[] }>(
      `/sobjects/${sobject}/`,
      JSON.stringify(data),
      this.authHeaders,
    );
    return res.data.id;
  }

  async get<T = any>(sobject: string, id: string): Promise<T> {
    await this.ensureToken();
    const res = await this.client.get<T>(`/sobjects/${sobject}/${id}`, this.authHeaders);
    return res.data;
  }

  async update(sobject: string, id: string, data: Record<string, any>): Promise<void> {
    await this.ensureToken();
    await this.client.patch(
      `/sobjects/${sobject}/${id}`,
      JSON.stringify(data),
      { ...this.authHeaders, "Content-Type": "application/json" },
    );
  }

  async delete(sobject: string, id: string): Promise<void> {
    await this.ensureToken();
    await this.client.delete(`/sobjects/${sobject}/${id}`, this.authHeaders);
  }

  // ── Search ──────────────────────────────────────────────────────────────

  async search<T = any>(query: string): Promise<T[]> {
    await this.ensureToken();
    const res = await this.client
      .get<{ searchRecords: T[] }>(`/search?q=${encodeURIComponent(query)}`, this.authHeaders)
      .then((r) => r.data);
    return res.searchRecords;
  }

  // ── Bulk API 2.0 ────────────────────────────────────────────────────────

  async bulkCreate(sobject: string, records: Record<string, any>[]): Promise<any> {
    await this.ensureToken();
    const job = await this.client.post<{ id: string }>(
      "/jobs/ingest",
      JSON.stringify({ object: sobject, operation: "insert", contentType: "CSV" }),
      this.authHeaders,
    );
    return job.data;
  }

  // ── Convenience Methods ─────────────────────────────────────────────────

  async createContact(data: Partial<SalesforceContact>): Promise<string> {
    return this.create("Contact", data);
  }

  async getContact(id: string): Promise<SalesforceContact> {
    return this.get<SalesforceContact>("Contact", id);
  }

  async searchContacts(query: string): Promise<SalesforceContact[]> {
    return this.queryAll<SalesforceContact>(`SELECT Id, FirstName, LastName, Email, Phone, Title FROM Contact WHERE ${query}`);
  }

  async createAccount(data: Partial<SalesforceAccount>): Promise<string> {
    return this.create("Account", data);
  }

  async getAccount(id: string): Promise<SalesforceAccount> {
    return this.get<SalesforceAccount>("Account", id);
  }

  async createLead(data: Partial<SalesforceLead>): Promise<string> {
    return this.create("Lead", data);
  }

  async getLead(id: string): Promise<SalesforceLead> {
    return this.get<SalesforceLead>("Lead", id);
  }

  async createOpportunity(data: Partial<SalesforceOpportunity>): Promise<string> {
    return this.create("Opportunity", data);
  }

  async getOpportunity(id: string): Promise<SalesforceOpportunity> {
    return this.get<SalesforceOpportunity>("Opportunity", id);
  }

  async createTask(data: Partial<SalesforceTask>): Promise<string> {
    return this.create("Task", data);
  }

  async getTask(id: string): Promise<SalesforceTask> {
    return this.get<SalesforceTask>("Task", id);
  }

  // ── Health Check ─────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      const limits = await this.client.get("/limits", this.authHeaders);
      return limits.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Create a Salesforce client from stored connection config
 */
export function createSalesforceClient(config: ConnectionConfig): SalesforceClient {
  return new SalesforceClient(
    {
      accessToken: config.accessToken || "",
      refreshToken: config.refreshToken,
      expiresAt: config.expiresAt,
      instanceUrl: config.instanceUrl,
      scope: config.scope,
      raw: config,
    },
    {
      clientId: config.clientId || "",
      clientSecret: config.clientSecret || "",
      isSandbox: config.isSandbox,
    },
  );
}