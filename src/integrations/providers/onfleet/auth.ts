/**
 * Onfleet authentication — API key as HTTP Basic username (empty password),
 * per Onfleet's documented key contract: `Authorization: Basic base64(apiKey:)`.
 */
export function getOnfleetHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

export class OnfleetAuth {
  private apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  get headers() {
    return getOnfleetHeaders(this.apiKey);
  }
  get baseUrl() {
    return "https://onfleet.com/api/v2";
  }
}
