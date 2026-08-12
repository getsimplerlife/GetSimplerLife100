export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: any) => Promise<void>;
}

/**
 * Microsoft Graph change notifications (webhooks) require a subscription
 * (POST /subscriptions) pointed at a live receiver endpoint. The monitor slice
 * for Excel workbooks uses OneDrive change polling (delta) instead; push
 * subscription handlers will be added when a live receiver is deployed.
 */
export const microsoftExcelWebhookHandlers: WebhookHandler[] = [];
