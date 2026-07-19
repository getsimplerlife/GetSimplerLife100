/**
 * Mirth Connect Healthcare Connector — Webhooks
 *
 * Webhook handlers for Mirth Connect events.
 * Supports channel deployment status, message processing events,
 * and connector status changes.
 */
export interface MirthWebhookEvent {
  eventType: "channel_deployed" | "channel_undeployed" | "message_processed" | "connector_error" | "dashboard_alert";
  payload: Record<string, any>;
  channelId?: string;
  messageId?: string;
  timestamp?: string;
}

export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: MirthWebhookEvent) => Promise<void>;
}

export const channelDeployedHandler: WebhookHandler = {
  name: "mirth_channel_deployed_handler",
  description: "Process Mirth Connect channel deployment events",
  eventType: "channel_deployed",
  handler: async (event) => {
    console.log(`[Mirth] Channel deployed: ${JSON.stringify(event.payload)}`);
  },
};

export const messageProcessedHandler: WebhookHandler = {
  name: "mirth_message_processed_handler",
  description: "Process Mirth Connect message processed events",
  eventType: "message_processed",
  handler: async (event) => {
    console.log(`[Mirth] Message processed: ${JSON.stringify(event.payload)}`);
  },
};

export const connectorErrorHandler: WebhookHandler = {
  name: "mirth_connector_error_handler",
  description: "Process Mirth Connect connector error events",
  eventType: "connector_error",
  handler: async (event) => {
    console.log(`[Mirth] Connector error: ${JSON.stringify(event.payload)}`);
  },
};

export const mirthWebhookHandlers: WebhookHandler[] = [
  channelDeployedHandler,
  messageProcessedHandler,
  connectorErrorHandler,
];