import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class IntercomClient {
  private client: HttpClient;
  constructor(accessToken: string) {
    this.client = new HttpClient({ baseUrl: "https://api.intercom.io", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json", Accept: "application/json" }; }
  private accessToken = "";

  async listContacts(): Promise<any[]> { const r = await this.client.get("/contacts", this.headers); return r.data?.data || []; }
  async getContact(id: string): Promise<any> { const r = await this.client.get(`/contacts/${id}`, this.headers); return r.data; }
  async createContact(data: any): Promise<any> { const r = await this.client.post("/contacts", data, this.headers); return r.data; }
  async listConversations(): Promise<any[]> { const r = await this.client.get("/conversations", this.headers); return r.data?.data || []; }
  async getConversation(id: string): Promise<any> { const r = await this.client.get(`/conversations/${id}`, this.headers); return r.data; }
  async replyToConversation(id: string, data: any): Promise<any> { const r = await this.client.post(`/conversations/${id}/reply`, data, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/me", this.headers); return r.ok; } catch { return false; } }
}

export function createIntercomClient(config: ConnectionConfig): IntercomClient {
  const c = new IntercomClient(config.accessToken || "");
  if (config.accessToken) c.accessToken = config.accessToken;
  return c;
}