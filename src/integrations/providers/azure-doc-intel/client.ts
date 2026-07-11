import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class AzureDocIntelClient {
  private client: HttpClient; private apiKey: string; private endpoint: string;
  constructor(apiKey: string, endpoint: string) {
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.client = new HttpClient({ baseUrl: `${this.endpoint}/formrecognizer/documentModels/prebuilt-document:analyze?api-version=2023-07-31`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 30000 }, timeout: 120000 });
    this.apiKey = apiKey;
  }
  private get headers() { return { "Ocp-Apim-Subscription-Key": this.apiKey, "Content-Type": "application/json" }; }

  async analyzeDocument(url: string): Promise<any> { const r = await this.client.post("", { urlSource: url }, this.headers); const resultUrl = r.headers.get("Operation-Location"); if (resultUrl) { await new Promise(r => setTimeout(r, 5000)); const res = await fetch(resultUrl, { headers: { "Ocp-Apim-Subscription-Key": this.apiKey } }); return res.json(); } return r.data; }
  async analyzeLayout(url: string): Promise<any> { const r = await this.client.post(`/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31`, { urlSource: url }, this.headers); return r.data; }
  async analyzeInvoice(url: string): Promise<any> { const r = await this.client.post(`/formrecognizer/documentModels/prebuilt-invoice:analyze?api-version=2023-07-31`, { urlSource: url }, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get(`/formrecognizer/info?api-version=2023-07-31`, this.headers); return r.ok; } catch { return false; } }
}

export function createAzureDocIntelClient(config: ConnectionConfig): AzureDocIntelClient {
  return new AzureDocIntelClient(config.apiKey || "", config.endpoint || "");
}