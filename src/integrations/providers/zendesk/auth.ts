export function getZendeskHeaders(email: string, apiToken: string): Record<string, string> {
  return { Authorization: `Basic ${Buffer.from(`${email}/token:${apiToken}`).toString("base64")}`, "Content-Type": "application/json" };
}
export class ZendeskAuth {
  private email: string; private apiToken: string; private subdomain: string;
  constructor(email: string, apiToken: string, subdomain: string) { this.email = email; this.apiToken = apiToken; this.subdomain = subdomain; }
  get headers() { return { Authorization: `Basic ${Buffer.from(`${this.email}/token:${this.apiToken}`).toString("base64")}`, "Content-Type": "application/json" }; }
  get baseUrl() { return `https://${this.subdomain}.zendesk.com/api/v2`; }
}