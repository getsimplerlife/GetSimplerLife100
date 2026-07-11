import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class SPApiClient {
  private client: HttpClient; private refreshToken: string; private clientId: string; private clientSecret: string; private awsAccessKey: string; private awsSecretKey: string; private roleArn: string; private marketplaceId: string;
  constructor(conf: { refreshToken: string; clientId: string; clientSecret: string; awsAccessKey: string; awsSecretKey: string; roleArn: string; marketplaceId: string; region: string }) {
    this.client = new HttpClient({ baseUrl: `https://sellingpartnerapi-${conf.region || "na"}.amazon.com`, rateLimit: { maxRequestsPerSecond: 5 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.refreshToken = conf.refreshToken; this.clientId = conf.clientId; this.clientSecret = conf.clientSecret; this.awsAccessKey = conf.awsAccessKey; this.awsSecretKey = conf.awsSecretKey; this.roleArn = conf.roleArn; this.marketplaceId = conf.marketplaceId;
  }

  private async getAccessToken(): Promise<string> { const r = await fetch("https://api.amazon.com/auth/o2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: this.refreshToken, client_id: this.clientId, client_secret: this.clientSecret }) }); const d = await r.json(); return d.access_token; }

  async listOrders(createdAfter: string): Promise<any[]> { const token = await this.getAccessToken(); const r = await this.client.get(`/orders/v0/orders?CreatedAfter=${createdAfter}&MarketplaceIds=${this.marketplaceId}`, { "Content-Type": "application/json", "x-amz-access-token": token }); return r.data?.payload?.Orders || []; }
  async listOrderItems(orderId: string): Promise<any[]> { const token = await this.getAccessToken(); const r = await this.client.get(`/orders/v0/orders/${orderId}/orderItems`, { "Content-Type": "application/json", "x-amz-access-token": token }); return r.data?.payload?.OrderItems || []; }
  async getCatalogItem(asin: string): Promise<any> { const token = await this.getAccessToken(); const r = await this.client.get(`/catalog/2022-04-01/items/${asin}?marketplaceIds=${this.marketplaceId}`, { "Content-Type": "application/json", "x-amz-access-token": token }); return r.data; }
  async healthCheck(): Promise<boolean> { try { const token = await this.getAccessToken(); const r = await this.client.get("/orders/v0/orders?CreatedAfter=2020-01-01T00:00:00Z&MarketplaceIds=" + this.marketplaceId + "&MaxResultsPerPage=1", { "Content-Type": "application/json", "x-amz-access-token": token }); return r.ok; } catch { return false; } }
}

export function createSPApiClient(config: ConnectionConfig): SPApiClient {
  return new SPApiClient({ refreshToken: config.refreshToken || "", clientId: config.clientId || "", clientSecret: config.clientSecret || "", awsAccessKey: config.awsAccessKey || "", awsSecretKey: config.awsSecretKey || "", roleArn: config.roleArn || "", marketplaceId: config.marketplaceId || "ATVPDKIKX0DER", region: config.region || "na" });
}