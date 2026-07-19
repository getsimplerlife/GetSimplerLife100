/**
 * Iguana Health Connector — Webhooks
 *
 * Webhook handlers for Iguana events.
 * Supports channel status changes and message processing events.
 */
export interface IguanaWebhookEvent {
  eventType: "channel_status" | "message_received" | "message_error";
  payload: Record<string, any>;
  channelId?: string;
  messageId?: string;
  timestamp?: string;
}

export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: IguanaWebhookEvent) => Promise<void>;
}

export const channelStatusHandler: WebhookHandler = {
  name: "iguana_channel_status_handler",
  description: "Process Iguana channel status change events",
  eventType: "channel_status",
  handler: async (event) => {
    console.log(`[Iguana] Channel status change: ${JSON.stringify(event.payload)}`);
  },
};

export const messageReceivedHandler: WebhookHandler = {
  name: "iguana_message_received_handler",
  description: "Process Iguana message received events",
  eventType: "message_received",
  handler: async (event) => {
    console.log(`[Iguana] Message received: ${JSON.stringify(event.payload)}`);
  },
};

export const messageErrorHandler: WebhookHandler = {
  name: "iguana_message_error_handler",
  description: "Process Iguana message error events",
  eventType: "message_error",
  handler: async (event) => {
    console.log(`[Iguana] Message error: ${JSON.stringify(event.payload)}`);
  },
};

export const iguanaWebhookHandlers: WebhookHandler[] = [
  channelStatusHandler,
  messageReceivedHandler,
  messageErrorHandler,
];