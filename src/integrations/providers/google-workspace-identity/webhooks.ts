export interface WebhookHandler { name: string; description: string; eventType: string; handler: (event: any) => Promise<void>; }
export const google_workspace_identityWebhookHandlers: WebhookHandler[] = [];
