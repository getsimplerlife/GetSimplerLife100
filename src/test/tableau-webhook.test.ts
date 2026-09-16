import { describe, expect, it, beforeEach } from "vitest";
import { tableauWebhookHandlers, tableauEventLog, clearTableauEventLog } from "../integrations/providers/tableau/webhooks";

describe("Tableau webhook handlers", () => {
  beforeEach(() => clearTableauEventLog());

  it("registers the eight Connect event types", () => {
    const types = tableauWebhookHandlers.map((h) => h.eventType);
    expect(types).toContain("workbook-published");
    expect(types).toContain("workbook-updated");
    expect(types).toContain("datasource-published");
    expect(types).toContain("datasource-updated");
    expect(types).toContain("datasource-refresh-succeeded");
    expect(types).toContain("datasource-refresh-failed");
    expect(types).toContain("flow-run-succeeded");
    expect(types).toContain("flow-run-failed");
  });

  it("normalizes a canonical Tableau webhook payload into the event log", async () => {
    const handler = tableauWebhookHandlers.find((h) => h.eventType === "datasource-refresh-succeeded")!;
    await handler.handler({
      event: { type: "datasource-refresh-succeeded", resource_id: "ds-1", created_at: "2026-08-03T00:00:00Z", creator_id: "u1" },
      site: { id: "site-1", name: "Analytics" },
      created_at: "2026-08-03T00:00:00Z",
    });
    expect(tableauEventLog.length).toBe(1);
    expect(tableauEventLog[0]).toMatchObject({
      eventType: "datasource-refresh-succeeded",
      resourceId: "ds-1",
      siteId: "site-1",
      siteName: "Analytics",
    });
  });

  it("accepts a flat payload shape with resourceId", async () => {
    const handler = tableauWebhookHandlers.find((h) => h.eventType === "workbook-published")!;
    await handler.handler({ eventType: "workbook-published", resourceId: "wb-9", siteId: "site-1", created_at: "2026-08-03T00:00:00Z" });
    expect(tableauEventLog[0].resourceId).toBe("wb-9");
  });

  it("fails closed (no log entry) when no resource id is present", async () => {
    const handler = tableauWebhookHandlers.find((h) => h.eventType === "datasource-refresh-failed")!;
    await expect(handler.handler({ event: { type: "datasource-refresh-failed" } })).rejects.toThrow("missing resource_id");
    expect(tableauEventLog.length).toBe(0);
  });
});
