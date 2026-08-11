import { describe, expect, it, beforeEach } from "vitest";
import { coupaWebhookHandlers, coupaEventLog, clearCoupaEventLog } from "../integrations/providers/coupa/webhooks";

describe("Coupa webhook handlers", () => {
  beforeEach(() => clearCoupaEventLog());

  it("registers handlers for purchase order lifecycle events", () => {
    const names = coupaWebhookHandlers.map((h) => h.name);
    expect(names).toContain("coupa-purchase-order-created");
    expect(names).toContain("coupa-purchase-order-updated");
    expect(names).toContain("coupa-purchase-order-submitted");
    expect(names).toContain("coupa-purchase-order-approved");
    expect(names).toContain("coupa-purchase-order-rejected");
    expect(coupaWebhookHandlers.length).toBe(5);
  });

  it("normalizes a canonical purchase order payload into the event log", async () => {
    const handler = coupaWebhookHandlers.find((h) => h.eventType === "purchase_order.created")!;
    await handler.handler({ eventType: "purchase_order.created", purchaseOrderId: "PO-1", time: 1234 });
    expect(coupaEventLog).toHaveLength(1);
    expect(coupaEventLog[0]).toMatchObject({ eventType: "purchase_order.created", purchaseOrderId: "PO-1", time: 1234 });
  });

  it("accepts a nested object shape with an id inside purchase_order", async () => {
    const handler = coupaWebhookHandlers.find((h) => h.eventType === "purchase_order.approved")!;
    await handler.handler({ eventType: "purchase_order.approved", purchase_order: { id: "PO-9" } });
    expect(coupaEventLog[0].purchaseOrderId).toBe("PO-9");
  });

  it("accepts an object envelope shape with an id inside object", async () => {
    const handler = coupaWebhookHandlers.find((h) => h.eventType === "purchase_order.updated")!;
    await handler.handler({ eventType: "purchase_order.updated", object: { id: "PO-7" } });
    expect(coupaEventLog[0].purchaseOrderId).toBe("PO-7");
  });

  it("fails closed — refuses to log an event with no purchase order or supplier id", async () => {
    const handler = coupaWebhookHandlers.find((h) => h.eventType === "purchase_order.rejected")!;
    await expect(handler.handler({ eventType: "purchase_order.rejected", time: 5 })).rejects.toThrow(/missing purchaseOrderId/);
    expect(coupaEventLog).toHaveLength(0);
  });
});
