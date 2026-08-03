/**
 * Coupa authentication — API key in `X-API-KEY` header against
 * `https://{instance}.coupahost.com/api`.
 */
export function getCoupaHeaders(apiKey: string): Record<string, string> {
  return {
    "X-API-KEY": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export class CoupaAuth {
  private apiKey: string;
  private instance: string;
  constructor(apiKey: string, instance: string) {
    this.apiKey = apiKey;
    this.instance = instance;
  }
  get headers() {
    return getCoupaHeaders(this.apiKey);
  }
  get baseUrl() {
    return `https://${this.instance}.coupahost.com/api`;
  }
}
