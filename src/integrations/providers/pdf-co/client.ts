import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class PDFCoClient {
  private client: HttpClient; private apiKey: string;
  constructor(apiKey: string) {
    this.client = new HttpClient({ baseUrl: "https://api.pdf.co/v1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 60000 });
    this.apiKey = apiKey;
  }
  private get headers() { return { "x-api-key": this.apiKey, "Content-Type": "application/json" }; }

  async pdfMake(data: any): Promise<any> { const r = await this.client.post("/pdf/make", data, this.headers); return r.data; }
  async pdfExtractText(url: string): Promise<any> { const r = await this.client.post("/pdf/extracttext", { url }, this.headers); return r.data; }
  async pdfMerge(urls: string[]): Promise<any> { const r = await this.client.post("/pdf/merge", { name: "merged.pdf", urls }, this.headers); return r.data; }
  async pdfSplit(url: string): Promise<any> { const r = await this.client.post("/pdf/split", { url }, this.headers); return r.data; }
  async pdfConvert(data: any): Promise<any> { const r = await this.client.post("/pdf/convert", data, this.headers); return r.data; }
  async barcodeGenerate(data: any): Promise<any> { const r = await this.client.post("/barcode/generate", data, this.headers); return r.data; }
  async ocr(url: string, lang = "eng"): Promise<any> { const r = await this.client.post("/pdf/ocr", { url, lang }, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/info", this.headers); return r.ok; } catch { return false; } }
}

export function createPDFCoClient(config: ConnectionConfig): PDFCoClient {
  return new PDFCoClient(config.apiKey || "");
}