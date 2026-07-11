export interface WebhookHandler { name: string; description: string; eventType: string; handler: (event: any) => Promise<void>; }

export const twilioSMSWebhook: WebhookHandler = {
  name: "twilio_incoming_sms", description: "Handle incoming Twilio SMS", eventType: "sms.inbound",
  handler: async (event) => { console.log(`[Twilio] SMS from ${event.From}: ${event.Body}`); },
};

export const twilioVoiceWebhook: WebhookHandler = {
  name: "twilio_incoming_call", description: "Handle incoming Twilio voice call", eventType: "call.inbound",
  handler: async (event) => { console.log(`[Twilio] Call from ${event.From}`); },
};

export const twilioWebhookHandlers: WebhookHandler[] = [twilioSMSWebhook, twilioVoiceWebhook];