/**
 * Iguana Health Connector — Auth
 *
 * Iguana uses API key-based authentication for its admin API.
 * Supports both HTTP and HTTPS connections.
 */
export interface IguanaAuthConfig {
  baseUrl: string;
  apiKey: string;
  username?: string;
  password?: string;
  useSSL?: boolean;
}

/**
 * Get the base API URL for Iguana
 */
export function getIguanaApiUrl(config: IguanaAuthConfig): string {
  const protocol = config.useSSL !== false ? "https" : "http";
  const base = config.baseUrl.replace(/\/+$/, "");
  return `${protocol}://${base}`;
}

/**
 * Get auth headers for Iguana admin API
 */
export function getIguanaAuthHeaders(config: IguanaAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (config.apiKey) {
    headers["x-api-key"] = config.apiKey;
  } else if (config.username && config.password) {
    const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    headers.Authorization = `Basic ${encoded}`;
  }

  return headers;
}