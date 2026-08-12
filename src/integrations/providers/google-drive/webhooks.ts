export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: any) => Promise<void>;
}

/**
 * Google Drive push notifications (webhook) require a Drive "watch" channel:
 * POST /files/{id}/watch or /changes/watch with a webhook address. A live
 * receiver endpoint must be deployed before these handlers can fire, so the
 * module ships with the change channel definition and the monitor slice uses
 * polling (listChangesSince) which is verifiable via the batch CLI.
 */
export const gdriveWebhookHandlers: WebhookHandler[] = [];
