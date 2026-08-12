export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: any) => Promise<void>;
}

/**
 * Google Calendar has no push webhook for arbitrary tenants without a deployed
 * watch-channel receiver; monitor slices poll events.list (timeMin window),
 * which the client module supports. No handlers are registered.
 */
export const googleCalendarWebhookHandlers: WebhookHandler[] = [];
