export class FreshdeskAuth {
  private apiKey: string; private domain: string;
  constructor(apiKey: string, domain: string) { this.apiKey = apiKey; this.domain = domain; }
  get headers() { return { Authorization: `Basic ${Buffer.from(`${this.apiKey}:X`).toString("base64")}`, "Content-Type": "application/json" }; }
  get baseUrl() { return `https://${this.domain}.freshdesk.com/api/v2`; }
}