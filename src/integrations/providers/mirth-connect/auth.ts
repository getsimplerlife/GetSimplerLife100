/**
 * Mirth Connect — Auth
 *
 * Mirth Connect uses HTTP Basic Auth or API key-based authentication
 * for its REST API. Supports both HTTP and HTTPS.
 */
export interface MirthAuthConfig {
  baseUrl: string;
  username: string;
  password: string;
  apiKey?: string;
  useSSL?: boolean;
  version?: string;
}

/**
 * Get the base API URL for Mirth Connect
 */
export function getMirthApiUrl(config: MirthAuthConfig): string {
  const protocol = config.useSSL !== false ? "https" : "http";
  const base = config.baseUrl.replace(/\/+$/, "");
  return `${protocol}://${base}/api`;
}

/**
 * Get auth headers for Mirth Connect REST API
 */
export function getMirthAuthHeaders(config: MirthAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (config.apiKey) {
    headers["x-api-key"] = config.apiKey;
  }

  if (config.username && config.password) {
    const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    headers.Authorization = `Basic ${encoded}`;
  }

  return headers;
}