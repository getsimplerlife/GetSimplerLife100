/**
 * HubSpot Integration — Webhooks
 */
export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: any) => Promise<void>;
}

export const contactWebhookHandler: WebhookHandler = {
  name: "hubspot_contact_change",
  description: "Handle HubSpot contact property changes",
  eventType: "contact.propertyChange",
  handler: async (event) => {
    console.log(`[HubSpot] Contact changed: ${event.objectId}`);
  },
};

export const dealWebhookHandler: WebhookHandler = {
  name: "hubspot_deal_change",
  description: "Handle HubSpot deal stage changes",
  eventType: "deal.propertyChange",
  handler: async (event) => {
    console.log(`[HubSpot] Deal stage changed: ${event.objectId}`);
  },
};

export const hubSpotWebhookHandlers: WebhookHandler[] = [contactWebhookHandler, dealWebhookHandler];