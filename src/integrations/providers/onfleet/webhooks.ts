/**
 * Onfleet webhook handlers.
 *
 * Onfleet delivers webhook events with a payload shaped like:
 *   { "action": "taskCompleted", "taskId": "...", "workerId": "...",
 *     "task": { ... }, "worker": { ... }, "time": 1234567890 }
 * Handlers normalize the payload into a log entry and fail closed when no
 * resource id can be extracted (no log entry is created for malformed events).
 */
export interface WebhookHandler {
  name: string;
  description: string;
  eventType: string;
  handler: (event: any) => Promise<void>;
}

export interface OnfleetWebhookEvent {
  eventType: string;
  taskId?: string;
  workerId?: string;
  time?: number;
  raw?: unknown;
}

/** Normalized event log (observable array) — used by the monitoring receiver. */
export const onfleetEventLog: OnfleetWebhookEvent[] = [];

export function clearOnfleetEventLog(): void {
  onfleetEventLog.length = 0;
}

function extractTaskId(event: any): string | undefined {
  if (typeof event?.taskId === "string" && event.taskId.length > 0) return event.taskId;
  if (typeof event?.task?.id === "string" && event.task.id.length > 0) return event.task.id;
  return undefined;
}

function extractWorkerId(event: any): string | undefined {
  if (typeof event?.workerId === "string" && event.workerId.length > 0) return event.workerId;
  if (typeof event?.worker?.id === "string" && event.worker.id.length > 0) return event.worker.id;
  return undefined;
}

function normalizeEvent(eventType: string, event: any): OnfleetWebhookEvent {
  const taskId = extractTaskId(event);
  const workerId = extractWorkerId(event);
  if (!taskId && !workerId) {
    throw new Error("Onfleet webhook event missing taskId/workerId — refusing to log");
  }
  return {
    eventType,
    taskId,
    workerId,
    time: typeof event?.time === "number" ? event.time : undefined,
    raw: event,
  };
}

function makeHandler(eventType: string): WebhookHandler["handler"] {
  return async (event: any) => {
    const normalized = normalizeEvent(eventType, event);
    onfleetEventLog.push(normalized);
  };
}

export const onfleetWebhookHandlers: WebhookHandler[] = [
  { name: "onfleet-task-started", description: "A delivery task was started", eventType: "taskStarted", handler: makeHandler("taskStarted") },
  { name: "onfleet-task-completed", description: "A delivery task was completed", eventType: "taskCompleted", handler: makeHandler("taskCompleted") },
  { name: "onfleet-task-failed", description: "A delivery task failed", eventType: "taskFailed", handler: makeHandler("taskFailed") },
  { name: "onfleet-task-assigned", description: "A delivery task was assigned to a worker", eventType: "taskAssigned", handler: makeHandler("taskAssigned") },
  { name: "onfleet-task-unassigned", description: "A delivery task was unassigned from a worker", eventType: "taskUnassigned", handler: makeHandler("taskUnassigned") },
  { name: "onfleet-task-updated", description: "A delivery task was updated", eventType: "taskUpdated", handler: makeHandler("taskUpdated") },
  { name: "onfleet-worker-created", description: "A worker (driver) was created", eventType: "workerCreated", handler: makeHandler("workerCreated") },
  { name: "onfleet-worker-updated", description: "A worker (driver) was updated", eventType: "workerUpdated", handler: makeHandler("workerUpdated") },
];
