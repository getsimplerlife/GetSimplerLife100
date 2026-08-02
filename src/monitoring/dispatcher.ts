import { isDuplicate, markSeen } from "./dedupe";
import { acquireLease, releaseLease } from "./lease";
import { canMonitor } from "./gates";
import type { EventOutcome, MonitoredEvent, MonitorConfig } from "./types";

export interface DispatchOptions { holderId: string; execute: (event: MonitoredEvent) => Promise<void>; verifySignature?: (event: MonitoredEvent, secret: string) => boolean; }
export async function dispatch(event: MonitoredEvent, config: MonitorConfig, options: DispatchOptions): Promise<EventOutcome> {
  if (!event.id || event.providerId !== config.providerId || event.employeeId !== config.employeeId || !config.eventTypes.includes(event.eventType)) return { eventId: event.id, status: "failed", reason: "Event does not match monitor configuration" };
  if (config.webhookSecret && (!event.signature || !options.verifySignature || !options.verifySignature(event, config.webhookSecret))) return { eventId: event.id, status: "failed", reason: "Invalid webhook signature" };
  if (!event.tenantId || !canMonitor(event.tenantId, event.employeeId)) return { eventId: event.id, status: "failed", reason: "Tenant is not entitled to monitoring" };
  if (isDuplicate(event)) return { eventId: event.id, status: "skipped", reason: "Duplicate event" };
  if (!acquireLease(event.id, options.holderId)) return { eventId: event.id, status: "skipped", reason: "Event is leased" };
  try { await options.execute(event); markSeen(event); return { eventId: event.id, status: "processed", dispatchedTo: event.employeeId }; } catch (error) { return { eventId: event.id, status: "failed", reason: error instanceof Error ? error.message : String(error) }; } finally { releaseLease(event.id, options.holderId); }
}
