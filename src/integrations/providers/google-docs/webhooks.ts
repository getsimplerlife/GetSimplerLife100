export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: any) => Promise<void>;
}

/**
 * Google Docs has no push webhook API — Drive push notifications (watch
 * channels) are the supported change channel and live in the google-drive
 * module. Monitor slices for docs therefore poll the Drive changes API.
 */
export const googleDocsWebhookHandlers: WebhookHandler[] = [];
