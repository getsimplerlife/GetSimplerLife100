/**
 * ClickHouse Integration — Webhooks
 *
 * ClickHouse does not natively support webhooks.
 * This module provides health check webhook handlers
 * for monitoring connection status.
 */
export interface ClickHouseWebhookEvent {
  eventType: "health_check" | "query_monitor";
  payload: Record<string, any>;
  timestamp?: string;
}

export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: ClickHouseWebhookEvent) => Promise<void>;
}

export const healthCheckHandler: WebhookHandler = {
  name: "clickhouse_health_check",
  description: "Process ClickHouse health check events",
  eventType: "health_check",
  handler: async (event) => {
    console.log(`[ClickHouse] Health check: ${JSON.stringify(event.payload)}`);
  },
};

export const clickhouseWebhookHandlers: WebhookHandler[] = [healthCheckHandler];