export interface WebhookHandler { name: string; description: string; eventType: string; handler: (event: any) => Promise<void>; }

export const aircallCallWebhook: WebhookHandler = {
  name: "aircall_incoming_call", description: "Handle incoming Aircall call", eventType: "call.incoming",
  handler: async (event) => { console.log(`[Aircall] Call from ${event.raw_digits}`); },
};

export const aircallWebhookHandlers: WebhookHandler[] = [aircallCallWebhook];