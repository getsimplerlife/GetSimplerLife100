export interface WebhookHandler { name: string; description: string; eventType: string; handler: (event: any) => Promise<void>; }
export const anthropic_claudeWebhookHandlers: WebhookHandler[] = [];
