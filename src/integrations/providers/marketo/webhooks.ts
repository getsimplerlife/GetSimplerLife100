export interface WebhookHandler { name: string; description: string; eventType: string; handler: (event: any) => Promise<void>; }

/**
 * Marketo webhook handlers.
 * Marketo webhooks are configured in the Marketo Admin UI (Webhooks section)
 * and POST JSON payloads to a configured endpoint on lead/activity events.
 */
export const marketoWebhookHandlers: WebhookHandler[] = [
  {
    name: "marketo-lead-created",
    description: "Handle Marketo lead created webhook",
    eventType: "lead.created",
    handler: async (event: any) => {
      console.log("[marketo-webhook] lead created", event?.leadId);
    },
  },
  {
    name: "marketo-lead-updated",
    description: "Handle Marketo lead updated webhook",
    eventType: "lead.updated",
    handler: async (event: any) => {
      console.log("[marketo-webhook] lead updated", event?.leadId);
    },
  },
  {
    name: "marketo-campaign-triggered",
    description: "Handle Marketo campaign triggered webhook",
    eventType: "campaign.triggered",
    handler: async (event: any) => {
      console.log("[marketo-webhook] campaign triggered", event?.campaignId);
    },
  },
];
