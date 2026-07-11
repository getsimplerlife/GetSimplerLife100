import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class CopperClient {
  private client: HttpClient; private headers: Record<string, string>;
  constructor(apiKey: string, email: string) {
    this.client = new HttpClient({ baseUrl: "https://api.copper.com/developer_api/v1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.headers = { "X-PW-AccessToken": apiKey, "X-PW-Application": "developer_api", "X-PW-UserEmail": email };
  }

  async searchPeople(query: string) {
    const res = await this.client.post<any>("/people/search", { search_criteria: [{ field_name: "name", operator: "contains", value: query }], per_page: 50 }, this.headers);
    return res.data;
  }
  async createPerson(data: any) { const res = await this.client.post<any>("/people", data, this.headers); return res.data; }
  async searchCompanies(query: string) {
    const res = await this.client.post<any>("/companies/search", { search_criteria: [{ field_name: "name", operator: "contains", value: query }], per_page: 50 }, this.headers);
    return res.data;
  }
  async createCompany(data: any) { const res = await this.client.post<any>("/companies", data, this.headers); return res.data; }
  async searchOpportunities(query: string) {
    const res = await this.client.post<any>("/opportunities/search", { search_criteria: [{ field_name: "name", operator: "contains", value: query }], per_page: 50 }, this.headers);
    return res.data;
  }
  async createOpportunity(data: any) { const res = await this.client.post<any>("/opportunities", data, this.headers); return res.data; }
  async healthCheck(): Promise<boolean> {
    try { const res = await this.client.get("/account", this.headers); return res.ok; } catch { return false; }
  }
}

export function createCopperClient(config: ConnectionConfig): CopperClient {
  return new CopperClient(config.apiKey || "", config.email || "");
}