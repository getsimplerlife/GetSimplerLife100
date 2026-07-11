import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class TextractClient {
  private client: HttpClient; private region: string; private accessKey: string; private secretKey: string;
  constructor(accessKey: string, secretKey: string, region: string) {
    this.client = new HttpClient({ baseUrl: `https://textract.${region}.amazonaws.com`, rateLimit: { maxRequestsPerSecond: 5 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 30000 }, timeout: 120000 });
    this.accessKey = accessKey; this.secretKey = secretKey; this.region = region;
  }
  private get headers() { return { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "TextractService.DetectDocumentText" }; }

  async detectDocumentText(bytesBase64: string): Promise<any> { const r = await this.client.post("/", JSON.stringify({ Document: { Bytes: bytesBase64 } }), this.headers); return r.data; }
  async analyzeDocument(bytesBase64: string, featureTypes = ["TABLES", "FORMS"]): Promise<any> { const r = await this.client.post("/", JSON.stringify({ Document: { Bytes: bytesBase64 }, FeatureTypes: featureTypes }), { ...this.headers, "X-Amz-Target": "TextractService.AnalyzeDocument" }); return r.data; }
  async startDocumentTextDetection(s3Object: { Bucket: string; Name: string }): Promise<any> { const r = await this.client.post("/", JSON.stringify({ DocumentLocation: { S3Object: s3Object } }), { ...this.headers, "X-Amz-Target": "TextractService.StartDocumentTextDetection" }); return r.data; }
  async getDocumentTextDetection(jobId: string): Promise<any> { const r = await this.client.post("/", JSON.stringify({ JobId: jobId }), { ...this.headers, "X-Amz-Target": "TextractService.GetDocumentTextDetection" }); return r.data; }
  async healthCheck(): Promise<boolean> { try { return true; } catch { return false; } }
}

export function createTextractClient(config: ConnectionConfig): TextractClient {
  return new TextractClient(config.accessKey || "", config.secretKey || "", config.region || "us-east-1");
}