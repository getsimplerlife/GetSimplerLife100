import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class TwilioClient {
  private client: HttpClient; private accountSid: string; private authToken: string;
  constructor(accountSid: string, authToken: string) {
    this.client = new HttpClient({ baseUrl: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`, rateLimit: { maxRequestsPerSecond: 30 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.accountSid = accountSid; this.authToken = authToken;
  }
  private get headers() { const basic = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64"); return { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }; }

  async sendSMS(to: string, from: string, body: string): Promise<any> { const r = await this.client.post("/Messages.json", { To: to, From: from, Body: body }, this.headers); return r.data; }
  async listMessages(limit = 50): Promise<any[]> { const r = await this.client.get(`/Messages.json?PageSize=${limit}`, this.headers); return r.data?.messages || []; }
  async makeCall(to: string, from: string, twiml: string): Promise<any> { const r = await this.client.post("/Calls.json", { To: to, From: from, Twiml: twiml }, this.headers); return r.data; }
  async getCall(callSid: string): Promise<any> { const r = await this.client.get(`/Calls/${callSid}.json`, this.headers); return r.data; }
  async listCalls(limit = 50): Promise<any[]> { const r = await this.client.get(`/Calls.json?PageSize=${limit}`, this.headers); return r.data?.calls || []; }
  async sendWhatsApp(to: string, from: string, body: string): Promise<any> { const r = await this.client.post("/Messages.json", { To: `whatsapp:${to}`, From: `whatsapp:${from}`, Body: body }, this.headers); return r.data; }
  async lookupPhoneNumber(phoneNumber: string): Promise<any> { const r = await this.client.get(`https://lookups.twilio.com/v1/PhoneNumbers/${phoneNumber}?Type=carrier`, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("", this.headers); return r.ok; } catch { return false; } }
}

export function createTwilioClient(config: ConnectionConfig): TwilioClient {
  return new TwilioClient(config.accountSid || "", config.authToken || "");
}