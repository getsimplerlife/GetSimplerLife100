/**
 * Airflow Orchestration Integration — Auth
 *
 * Supports API key and basic auth for Airflow REST API.
 * Airflow's REST API supports both JWT-based auth and
 * basic HTTP authentication.
 */
export interface AirflowAuthConfig {
  baseUrl: string;
  username?: string;
  password?: string;
  apiKey?: string;
  jwtToken?: string;
}

/**
 * Build the base URL for Airflow REST API
 * Removes trailing slash and appends /api/v1
 */
export function getAirflowApiUrl(config: AirflowAuthConfig): string {
  const base = config.baseUrl.replace(/\/+$/, "");
  return `${base}/api/v1`;
}

/**
 * Get auth headers for Airflow REST API
 */
export function getAirflowAuthHeaders(config: AirflowAuthConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  } else if (config.username && config.password) {
    const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64");
    headers.Authorization = `Basic ${encoded}`;
  } else if (config.jwtToken) {
    headers.Authorization = `Bearer ${config.jwtToken}`;
  }

  return headers;
}