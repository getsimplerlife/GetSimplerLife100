export interface WebhookHandler { name: string; description: string; eventType: string; handler: (event: any) => Promise<void>; }
/** Normalized, observable event log for DocuSign Connect deliveries (monitor path). */
export const docusignEventLog: Array<{ eventType: string; envelopeId: string; status?: string; receivedAt: string; raw?: any }> = [];
export function clearDocusignEventLog() { docusignEventLog.length = 0; }
/**
 * Normalize a DocuSign Connect payload into a common shape.
 * Accepts both Connect v1 (`{ envelopeId, status, ... }`) and v2 (`{ data: { envelopeId, envelopeSummary } }`) envelopes.
 * Fails closed (throws) when no envelopeId can be extracted — no guessed envelope.
 */
function normalizeEvent(event: any): { eventType: string; envelopeId: string; status?: string } {
  const payload = event?.data && typeof event.data === "object" && event.data.envelopeId ? event.data : event;
  const envelopeId = payload?.envelopeId || payload?.envelope_id;
  if (!envelopeId || typeof envelopeId !== "string") throw new Error("DocuSign webhook event missing envelopeId — dropped (fail closed)");
  return { eventType: String(payload?.event || event?.event || "unknown"), envelopeId, status: payload?.status || payload?.envelopeStatus };
}
function makeHandler(eventType: string, description: string): WebhookHandler {
  return {
    name: `docusign-${eventType}`,
    description,
    eventType: `docusign.${eventType}`,
    handler: async (event: any) => {
      const normalized = normalizeEvent(event);
      docusignEventLog.push({ eventType: `docusign.${eventType}`, envelopeId: normalized.envelopeId, status: normalized.status, receivedAt: new Date().toISOString(), raw: event });
    },
  };
}
export const docusignWebhookHandlers: WebhookHandler[] = [
  makeHandler("envelope-sent", "Envelope was sent to its first recipient"),
  makeHandler("envelope-completed", "All recipients completed signing"),
  makeHandler("envelope-declined", "A recipient declined the envelope"),
  makeHandler("envelope-voided", "The envelope was voided"),
  makeHandler("recipient-signed", "A recipient signed the envelope"),
  makeHandler("recipient-declined", "A recipient declined signing"),
];
