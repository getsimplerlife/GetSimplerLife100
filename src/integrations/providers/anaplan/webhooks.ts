export interface WebhookHandler { name: string; description: string; eventType: string; handler: (event: any) => Promise<void>; }

/**
 * Anaplan webhook handlers.
 * Anaplan supports webhook notifications for model/import/process events
 * configured through the Anaplan Integration API.
 */
export const anaplanWebhookHandlers: WebhookHandler[] = [
  {
    name: "anaplan-import-completed",
    description: "Handle Anaplan import completed notification",
    eventType: "import.completed",
    handler: async (event: any) => {
      console.log("[anaplan-webhook] import completed", event?.importId);
    },
  },
  {
    name: "anaplan-process-completed",
    description: "Handle Anaplan process completed notification",
    eventType: "process.completed",
    handler: async (event: any) => {
      console.log("[anaplan-webhook] process completed", event?.processId);
    },
  },
  {
    name: "anaplan-model-published",
    description: "Handle Anaplan model published notification",
    eventType: "model.published",
    handler: async (event: any) => {
      console.log("[anaplan-webhook] model published", event?.modelId);
    },
  },
];
