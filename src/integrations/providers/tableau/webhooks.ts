/**
 * Tableau webhook handlers (Tableau Server 2021.4+ / Tableau Cloud).
 *
 * Tableau delivers webhook events with a payload shaped like:
 *   { "event": { "type": "datasource-refresh-succeeded", "resource_id": "...",
 *                "created_at": "...", "creator_id": "..." },
 *     "site": { "id": "...", "name": "..." },
 *     "created_at": "..." }
 * Handlers normalize the payload into a log entry and fail closed when no
 * resource id can be extracted (no log entry is created for malformed events).
 */
export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: any) => Promise<void>;
}

export interface TableauWebhookEvent {
  eventType: string;
  resourceId: string;
  siteId?: string;
  siteName?: string;
  createdAt?: string;
  raw?: unknown;
}

/** Normalized event log (observable array) — used by the monitoring receiver. */
export const tableauEventLog: TableauWebhookEvent[] = [];

export function clearTableauEventLog(): void {
  tableauEventLog.length = 0;
}

function extractResourceId(event: any): string | undefined {
  // Canonical: { event: { resource_id } }
  if (typeof event?.event?.resource_id === "string" && event.event.resource_id.length > 0) {
    return event.event.resource_id;
  }
  // Fallback: flat payload { resourceId } or { id }
  if (typeof event?.resourceId === "string" && event.resourceId.length > 0) return event.resourceId;
  if (typeof event?.id === "string" && event.id.length > 0) return event.id;
  return undefined;
}

function normalizeEvent(eventType: string, event: any): TableauWebhookEvent {
  const resourceId = extractResourceId(event);
  if (!resourceId) throw new Error("Tableau webhook event missing resource_id — refusing to log");
  return {
    eventType,
    resourceId,
    siteId: event?.site?.id || event?.siteId,
    siteName: event?.site?.name || event?.siteName,
    createdAt: event?.event?.created_at || event?.created_at,
    raw: event,
  };
}

function makeHandler(eventType: string): WebhookHandler["handler"] {
  return async (event: any) => {
    const normalized = normalizeEvent(eventType, event);
    tableauEventLog.push(normalized);
  };
}

export const tableauWebhookHandlers: WebhookHandler[] = [
  { name: "tableau-workbook-published", description: "A Tableau workbook was published", eventType: "workbook-published", handler: makeHandler("workbook-published") },
  { name: "tableau-workbook-updated", description: "A Tableau workbook was updated", eventType: "workbook-updated", handler: makeHandler("workbook-updated") },
  { name: "tableau-datasource-published", description: "A Tableau datasource was published", eventType: "datasource-published", handler: makeHandler("datasource-published") },
  { name: "tableau-datasource-updated", description: "A Tableau datasource was updated", eventType: "datasource-updated", handler: makeHandler("datasource-updated") },
  { name: "tableau-datasource-refresh-succeeded", description: "A Tableau datasource extract refresh succeeded", eventType: "datasource-refresh-succeeded", handler: makeHandler("datasource-refresh-succeeded") },
  { name: "tableau-datasource-refresh-failed", description: "A Tableau datasource extract refresh failed", eventType: "datasource-refresh-failed", handler: makeHandler("datasource-refresh-failed") },
  { name: "tableau-flow-run-succeeded", description: "A Tableau flow run succeeded", eventType: "flow-run-succeeded", handler: makeHandler("flow-run-succeeded") },
  { name: "tableau-flow-run-failed", description: "A Tableau flow run failed", eventType: "flow-run-failed", handler: makeHandler("flow-run-failed") },
];
