import { describe, expect, it, beforeEach } from "vitest";
import { onfleetWebhookHandlers, onfleetEventLog, clearOnfleetEventLog } from "../integrations/providers/onfleet/webhooks";

describe("Onfleet webhook handlers", () => {
  beforeEach(() => clearOnfleetEventLog());

  it("registers handlers for task and worker events", () => {
    const names = onfleetWebhookHandlers.map((h) => h.name);
    expect(names).toContain("onfleet-task-started");
    expect(names).toContain("onfleet-task-completed");
    expect(names).toContain("onfleet-task-failed");
    expect(names).toContain("onfleet-task-assigned");
    expect(names).toContain("onfleet-task-unassigned");
    expect(names).toContain("onfleet-task-updated");
    expect(names).toContain("onfleet-worker-created");
    expect(names).toContain("onfleet-worker-updated");
    expect(onfleetWebhookHandlers.length).toBe(8);
  });

  it("normalizes a canonical task payload into the event log", async () => {
    const handler = onfleetWebhookHandlers.find((h) => h.eventType === "taskCompleted")!;
    await handler.handler({ action: "taskCompleted", taskId: "TASK-1", workerId: "WORKER-1", time: 1234 });
    expect(onfleetEventLog).toHaveLength(1);
    expect(onfleetEventLog[0]).toMatchObject({ eventType: "taskCompleted", taskId: "TASK-1", workerId: "WORKER-1", time: 1234 });
  });

  it("accepts a flat payload shape with only an id inside task", async () => {
    const handler = onfleetWebhookHandlers.find((h) => h.eventType === "taskStarted")!;
    await handler.handler({ action: "taskStarted", task: { id: "T-9" } });
    expect(onfleetEventLog[0].taskId).toBe("T-9");
  });

  it("fails closed — refuses to log an event with no task or worker id", async () => {
    const handler = onfleetWebhookHandlers.find((h) => h.eventType === "taskUpdated")!;
    await expect(handler.handler({ action: "taskUpdated", time: 5 })).rejects.toThrow(/missing taskId\/workerId/);
    expect(onfleetEventLog).toHaveLength(0);
  });
});
