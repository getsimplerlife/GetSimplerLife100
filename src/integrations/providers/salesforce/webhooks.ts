/**
 * Salesforce Integration — Webhooks
 *
 * Webhook verification and event handlers for Salesforce
 * (Outbound Messages, Streaming API, Change Data Capture).
 */

export interface SalesforceWebhookEvent {
  eventType: "outbound_message" | "platform_event" | "cdc_event";
  payload: Record<string, any>;
  organizationId?: string;
  userId?: string;
}

export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: SalesforceWebhookEvent) => Promise<void>;
}

// ── Outbound Message Verification ─────────────────────────────────────────

export function verifyOutboundMessage(
  body: Record<string, any>,
  sessionId?: string,
): boolean {
  // Salesforce Outbound Messages include a SessionId for verification
  if (sessionId && body.SessionId) {
    return body.SessionId === sessionId;
  }
  // Basic check: must have valid structure
  return !!(body?.sobject && body?.organizationId);
}

// ── Change Data Capture Handler ───────────────────────────────────────────

export const cdcEventHandler: WebhookHandler = {
  name: "salesforce_cdc_handler",
  description: "Process Salesforce Change Data Capture events",
  eventType: "cdc_event",
  handler: async (event) => {
    const { payload } = event;
    console.log(`[Salesforce CDC] Processing change for: ${payload.ChangeEventHeader?.entityType}`);
    // Route to appropriate workflow based on entity type
    const entityType = payload.ChangeEventHeader?.entityType;
    switch (entityType) {
      case "Contact":
        console.log(`[Salesforce CDC] Contact changed: ${payload.ContactId}`);
        break;
      case "Opportunity":
        console.log(`[Salesforce CDC] Opportunity changed: ${payload.OpportunityId}`);
        break;
      case "Lead":
        console.log(`[Salesforce CDC] Lead changed: ${payload.LeadId}`);
        break;
      default:
        console.log(`[Salesforce CDC] Unknown entity: ${entityType}`);
    }
  },
};

// ── All Handlers Export ───────────────────────────────────────────────────

export const salesforceWebhookHandlers: WebhookHandler[] = [cdcEventHandler];