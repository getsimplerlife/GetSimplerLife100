/**
 * ClickHouse Integration — Auth
 *
 * ClickHouse uses API key or password-based authentication
 * via the HTTP interface. Supports both self-hosted and
 * ClickHouse Cloud instances.
 */
export interface ClickHouseAuthConfig {
  host: string;
  port?: number;
  protocol?: "http" | "https";
  username: string;
  password: string;
  database?: string;
  isCloud?: boolean;
}

/**
 * Build the base URL for ClickHouse HTTP interface
 */
export function buildClickHouseUrl(config: ClickHouseAuthConfig): string {
  const protocol = config.protocol || (config.isCloud ? "https" : "http");
  const port = config.port || (config.isCloud ? 8443 : 8123);
  return `${protocol}://${config.host}:${port}`;
}

/**
 * Get auth headers for ClickHouse HTTP interface
 */
export function getClickHouseAuthHeaders(config: ClickHouseAuthConfig): Record<string, string> {
  const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    "Content-Type": "application/json",
  };
}

/**
 * Build query parameters for ClickHouse requests
 */
export function buildClickHouseParams(config: ClickHouseAuthConfig, extra?: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams({
    user: config.username,
    password: config.password,
    database: config.database || "default",
    ...extra,
  });
  return params;
}