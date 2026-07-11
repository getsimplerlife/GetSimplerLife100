import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class FreshsalesClient {
  private client: HttpClient; private apiKey: string;
  constructor(apiKey: string, domain: string) {
    this.client = new HttpClient({ baseUrl: `https://${domain}.myfreshworks.com/crm/sales/api`, rateLimit: { maxRequestsPerSecond: 30 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.apiKey = apiKey;
  }
  private get headers() { return { Authorization: `Token token=${this.apiKey}`, "Content-Type": "application/json" }; }

  async searchContacts(query: string) {
    const res = await this.client.get<any>(`/contacts?q=${encodeURIComponent(query)}&per_page=50`, this.headers);
    return res.data?.contacts || [];
  }
  async createContact(data: any) { const res = await this.client.post<any>("/contacts", { contact: data }, this.headers); return res.data?.contact; }
  async searchDeals(query: string) {
    const res = await this.client.get<any>(`/deals?q=${encodeURIComponent(query)}&per_page=50`, this.headers);
    return res.data?.deals || [];
  }
  async createDeal(data: any) { const res = await this.client.post<any>("/deals", { deal: data }, this.headers); return res.data?.deal; }
  async searchAccounts(query: string) {
    const res = await this.client.get<any>(`/sales_accounts?q=${encodeURIComponent(query)}&per_page=50`, this.headers);
    return res.data?.sales_accounts || [];
  }
  async createAccount(data: any) { const res = await this.client.post<any>("/sales_accounts", { sales_account: data }, this.headers); return res.data?.sales_account; }
  async healthCheck(): Promise<boolean> {
    try { const res = await this.client.get("/contacts?per_page=1", this.headers); return res.ok; } catch { return false; }
  }
}

export function createFreshsalesClient(config: ConnectionConfig): FreshsalesClient {
  return new FreshsalesClient(config.apiKey || "", config.domain || "");
}