import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class PandaDocClient {
  private client: HttpClient; private apiKey: string;
  constructor(apiKey: string) {
    this.client = new HttpClient({ baseUrl: "https://api.pandadoc.com/public/v1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.apiKey = apiKey;
  }
  private get headers() { return { Authorization: `API-Key ${this.apiKey}`, "Content-Type": "application/json" }; }

  async listDocuments(): Promise<any[]> { const r = await this.client.get("/documents", this.headers); return r.data?.results || []; }
  async createDocument(data: any): Promise<any> { const r = await this.client.post("/documents", data, this.headers); return r.data; }
  async getDocument(id: string): Promise<any> { const r = await this.client.get(`/documents/${id}`, this.headers); return r.data; }
  async sendDocument(id: string, data: any): Promise<any> { const r = await this.client.post(`/documents/${id}/send`, data, this.headers); return r.data; }
  async getDocumentStatus(id: string): Promise<any> { const r = await this.client.get(`/documents/${id}/status`, this.headers); return r.data; }
  async listTemplates(): Promise<any[]> { const r = await this.client.get("/templates", this.headers); return r.data?.results || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/documents?count=1", this.headers); return r.ok; } catch { return false; } }
}

export function createPandaDocClient(config: ConnectionConfig): PandaDocClient {
  return new PandaDocClient(config.apiKey || "");
}