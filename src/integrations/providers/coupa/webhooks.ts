/**
 * Coupa webhook handlers.
 *
 * Coupa delivers webhook events for purchase order lifecycle changes with a
 * payload that carries the changed object. Handlers normalize the payload into
 * a log entry and fail closed when no resource id can be extracted (no log
 * entry is created for malformed events).
 *
 * This module performs no network calls and no signature verification — it is
 * the normalization layer only. The monitoring receiver owns signature checks,
 * tenant routing, dedupe, and entitlement gating (see
 * /home/team/shared/controlled-monitoring-event-architecture-2026-08-02.md).
 */
export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: any) => Promise<void>;
}

export interface CoupaWebhookEvent {
  eventType: string;
  purchaseOrderId?: string;
  supplierId?: string;
  time?: number;
  raw?: unknown;
}

/** Normalized event log (observable array) — used by the monitoring receiver. */
export const coupaEventLog: CoupaWebhookEvent[] = [];

export function clearCoupaEventLog(): void {
  coupaEventLog.length = 0;
}

function extractPurchaseOrderId(event: any): string | undefined {
  if (typeof event?.purchaseOrderId === "string" && event.purchaseOrderId.length > 0) return event.purchaseOrderId;
  if (typeof event?.purchase_order_id === "string" && event.purchase_order_id.length > 0) return event.purchase_order_id;
  if (typeof event?.purchaseOrder?.id === "string" && event.purchaseOrder.id.length > 0) return event.purchaseOrder.id;
  if (typeof event?.purchase_order?.id === "string" && event.purchase_order.id.length > 0) return event.purchase_order.id;
  if (typeof event?.object?.id === "string" && event.object.id.length > 0) return event.object.id;
  return undefined;
}

function extractSupplierId(event: any): string | undefined {
  if (typeof event?.supplierId === "string" && event.supplierId.length > 0) return event.supplierId;
  if (typeof event?.supplier?.id === "string" && event.supplier.id.length > 0) return event.supplier.id;
  return undefined;
}

function normalizeEvent(eventType: string, event: any): CoupaWebhookEvent {
  const purchaseOrderId = extractPurchaseOrderId(event);
  const supplierId = extractSupplierId(event);
  if (!purchaseOrderId && !supplierId) {
    throw new Error("Coupa webhook event missing purchaseOrderId/supplierId — refusing to log");
  }
  return {
    eventType,
    purchaseOrderId,
    supplierId,
    time: typeof event?.time === "number" ? event.time : undefined,
    raw: event,
  };
}

function makeHandler(eventType: string): WebhookHandler["handler"] {
  return async (event: any) => {
    const normalized = normalizeEvent(eventType, event);
    coupaEventLog.push(normalized);
  };
}

export const coupaWebhookHandlers: WebhookHandler[] = [
  { name: "coupa-purchase-order-created", description: "A purchase order was created", eventType: "purchase_order.created", handler: makeHandler("purchase_order.created") },
  { name: "coupa-purchase-order-updated", description: "A purchase order was updated", eventType: "purchase_order.updated", handler: makeHandler("purchase_order.updated") },
  { name: "coupa-purchase-order-submitted", description: "A purchase order was submitted for approval", eventType: "purchase_order.submitted", handler: makeHandler("purchase_order.submitted") },
  { name: "coupa-purchase-order-approved", description: "A purchase order was approved", eventType: "purchase_order.approved", handler: makeHandler("purchase_order.approved") },
  { name: "coupa-purchase-order-rejected", description: "A purchase order was rejected", eventType: "purchase_order.rejected", handler: makeHandler("purchase_order.rejected") },
];
