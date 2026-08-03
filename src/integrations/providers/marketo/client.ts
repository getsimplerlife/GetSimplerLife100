import { HttpClient } from "../../framework/client";
import { getMarketoAuthHeaders, getMarketoBaseUrl, validateMarketoCredential, type MarketoCredential } from "./auth";
import type { ConnectionConfig } from "../../framework/connection";

/**
 * Canonical Marketo REST API client.
 *
 * All paths are relative to https://{restEndpoint}/rest.
 * Reads are fail-closed: unknown paths throw.
 * Writes require Authorization: Bearer header.
 */
export class MarketoClient {
  private client: HttpClient;
  private accessToken: string;
  private restEndpoint: string;

  constructor(accessToken: string, restEndpoint: string) {
    if (!accessToken) throw new Error("Marketo accessToken is required");
    if (!restEndpoint) throw new Error("Marketo restEndpoint is required");
    this.accessToken = accessToken;
    this.restEndpoint = restEndpoint;
    this.client = new HttpClient({
      baseUrl: getMarketoBaseUrl(restEndpoint),
      rateLimit: { maxRequestsPerSecond: 10 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
  }

  private get headers(): Record<string, string> {
    return getMarketoAuthHeaders(this.accessToken);
  }

  // ── Campaigns ──
  async listCampaigns(params?: { offset?: number; maxReturn?: number }): Promise<any[]> {
    const query = new URLSearchParams();
    if (params?.offset !== undefined) query.set("offset", String(params.offset));
    if (params?.maxReturn !== undefined) query.set("maxReturn", String(params.maxReturn));
    const path = `/asset/v1/campaigns.json${query.toString() ? `?${query}` : ""}`;
    const r = await this.client.get(path, this.headers);
    return r.data?.result || [];
  }

  async getCampaign(id: number): Promise<any> {
    const r = await this.client.get(`/asset/v1/campaign/${id}.json`, this.headers);
    return r.data?.result?.[0];
  }

  // ── Programs ──
  async listPrograms(params?: { offset?: number; maxReturn?: number }): Promise<any[]> {
    const query = new URLSearchParams();
    if (params?.offset !== undefined) query.set("offset", String(params.offset));
    if (params?.maxReturn !== undefined) query.set("maxReturn", String(params.maxReturn));
    const path = `/asset/v1/programs.json${query.toString() ? `?${query}` : ""}`;
    const r = await this.client.get(path, this.headers);
    return r.data?.result || [];
  }

  async getProgram(id: number): Promise<any> {
    const r = await this.client.get(`/asset/v1/program/${id}.json`, this.headers);
    return r.data?.result?.[0];
  }

  // ── Assets / Emails ──
  async listEmails(params?: { offset?: number; maxReturn?: number }): Promise<any[]> {
    const query = new URLSearchParams();
    if (params?.offset !== undefined) query.set("offset", String(params.offset));
    if (params?.maxReturn !== undefined) query.set("maxReturn", String(params.maxReturn));
    const path = `/asset/v1/emails.json${query.toString() ? `?${query}` : ""}`;
    const r = await this.client.get(path, this.headers);
    return r.data?.result || [];
  }

  async getEmail(id: number): Promise<any> {
    const r = await this.client.get(`/asset/v1/email/${id}.json`, this.headers);
    return r.data?.result?.[0];
  }

  // ── Leads / Lead Scores ──
  async listLeads(params?: { filterType?: string; filterValues?: string[]; fields?: string[] }): Promise<any[]> {
    const query = new URLSearchParams();
    if (params?.filterType) query.set("filterType", params.filterType);
    if (params?.filterValues?.length) query.set("filterValues", params.filterValues.join(","));
    if (params?.fields?.length) query.set("fields", params.fields.join(","));
    const path = `/v1/leads.json${query.toString() ? `?${query}` : ""}`;
    const r = await this.client.get(path, this.headers);
    return r.data?.result || [];
  }

  async getLead(id: number, fields?: string[]): Promise<any> {
    const query = new URLSearchParams();
    if (fields?.length) query.set("fields", fields.join(","));
    const path = `/v1/lead/${id}.json${query.toString() ? `?${query}` : ""}`;
    const r = await this.client.get(path, this.headers);
    return r.data?.result?.[0];
  }

  // ── Email Metrics ──
  async getEmailMetrics(emailId: number, params?: { createdAtStart?: string; createdAtEnd?: string }): Promise<any[]> {
    const query = new URLSearchParams();
    query.set("id", String(emailId));
    if (params?.createdAtStart) query.set("createdAtStart", params.createdAtStart);
    if (params?.createdAtEnd) query.set("createdAtEnd", params.createdAtEnd);
    const r = await this.client.get(`/v1/stats/email.json?${query}`, this.headers);
    return r.data?.result || [];
  }

  async getEmailSummaryStats(): Promise<any> {
    const r = await this.client.get("/v1/stats/email.json", this.headers);
    return r.data?.result;
  }

  // ── Lists ──
  async listLists(params?: { offset?: number; maxReturn?: number }): Promise<any[]> {
    const query = new URLSearchParams();
    if (params?.offset !== undefined) query.set("offset", String(params.offset));
    if (params?.maxReturn !== undefined) query.set("maxReturn", String(params.maxReturn));
    const path = `/asset/v1/staticLists.json${query.toString() ? `?${query}` : ""}`;
    const r = await this.client.get(path, this.headers);
    return r.data?.result || [];
  }

  // ── Write Operations ──
  async sendSampleEmail(emailId: number, emailAddress: string): Promise<any> {
    const r = await this.client.post(
      `/asset/v1/email/${emailId}/sendSample.json`,
      { emailAddress },
      this.headers,
    );
    return r.data;
  }

  async addLeadsToList(listId: number, leadIds: number[]): Promise<any> {
    const r = await this.client.post(
      `/v1/lists/${listId}/leads.json`,
      { input: leadIds.map((id) => ({ id })) },
      this.headers,
    );
    return r.data?.result;
  }

  async removeLeadsFromList(listId: number, leadIds: number[]): Promise<any> {
    const url = `${getMarketoBaseUrl(this.restEndpoint)}/v1/lists/${listId}/leads.json`;
    const r = await fetch(url, {
      method: "DELETE",
      headers: this.headers,
      body: JSON.stringify({ input: leadIds.map((id) => ({ id })) }),
    });
    if (!r.ok) throw new Error(`Marketo removeLeadsFromList failed: HTTP ${r.status}`);
    const data = await r.json();
    return data?.result;
  }

  async triggerCampaign(campaignId: number, leadIds: number[]): Promise<any> {
    const r = await this.client.post(
      `/v1/campaigns/${campaignId}/trigger.json`,
      { input: { leads: leadIds.map((id) => ({ id })) } },
      this.headers,
    );
    return r.data?.result;
  }

  // ── Health ──
  async healthCheck(): Promise<boolean> {
    try {
      // Lightweight call: list 1 program
      const r = await this.client.get("/asset/v1/programs.json?maxReturn=1", this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export function createMarketoClient(config: ConnectionConfig): MarketoClient {
  const cred: MarketoCredential = validateMarketoCredential({
    accessToken: config.accessToken || (config.apiKey as string) || "",
    restEndpoint: config.restEndpoint || (config.instanceUrl as string) || (config.subdomain as string) || "",
    clientId: config.clientId as string | undefined,
    clientSecret: config.clientSecret as string | undefined,
  });
  return new MarketoClient(cred.accessToken, cred.restEndpoint);
}
