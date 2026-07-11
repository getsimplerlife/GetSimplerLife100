import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class ZendeskClient {
  private client: HttpClient; private email: string; private apiToken: string;
  constructor(email: string, apiToken: string, subdomain: string) {
    this.client = new HttpClient({ baseUrl: `https://${subdomain}.zendesk.com/api/v2`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.email = email; this.apiToken = apiToken;
  }
  private get headers() { return { Authorization: `Basic ${Buffer.from(`${this.email}/token:${this.apiToken}`).toString("base64")}`, "Content-Type": "application/json" }; }

  async listTickets(): Promise<any[]> { const r = await this.client.get("/tickets", this.headers); return r.data?.tickets || []; }
  async getTicket(id: number): Promise<any> { const r = await this.client.get(`/tickets/${id}`, this.headers); return r.data?.ticket; }
  async createTicket(data: any): Promise<any> { const r = await this.client.post("/tickets", { ticket: data }, this.headers); return r.data?.ticket; }
  async updateTicket(id: number, data: any): Promise<any> { const r = await this.client.put(`/tickets/${id}`, { ticket: data }, this.headers); return r.data?.ticket; }
  async searchTickets(query: string): Promise<any[]> { const r = await this.client.get(`/search?query=${encodeURIComponent(query)}`, this.headers); return r.data?.results || []; }
  async listUsers(): Promise<any[]> { const r = await this.client.get("/users", this.headers); return r.data?.users || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/tickets?per_page=1", this.headers); return r.ok; } catch { return false; } }
}

export function createZendeskClient(config: ConnectionConfig): ZendeskClient {
  return new ZendeskClient(config.email || "", config.apiToken || "", config.subdomain || "");
}