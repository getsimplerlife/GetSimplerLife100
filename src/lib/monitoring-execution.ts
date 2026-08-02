/**
 * Tenant-scoped monitoring execution core.
 *
 * This module is deliberately provider-agnostic and has no network side effects.
 * Provider adapters must authenticate and normalize events before calling
 * executeMonitoringEvent. Unsupported/unverified events fail closed.
 */
export type MonitoringOutcome =
  | "queued"
  | "deduped"
  | "skipped_paused"
  | "skipped_unentitled"
  | "skipped_unsupported"
  | "failed";

export interface MonitoringEvent {
  eventId: string;
  tenantId: string;
  employeeId: string;
  connectionId: string;
  providerId: string;
  objectType: string;
  eventType: string;
  occurredAt: string;
  receivedAt: string;
  payloadHash: string;
  provenance: "provider_webhook" | "scheduled_read";
  authenticated: boolean;
  payload: Record<string, unknown>;
}

export interface MonitoringGate {
  purchased: boolean;
  employeeStatus: "Active" | "Paused" | "Draft" | "Failed" | "Cancelled";
  connectionTenantId: string;
  connectionActive: boolean;
}

export interface MonitoringAdapter {
  providerId: string;
  objectTypes: readonly string[];
  eventTypes: readonly string[];
}

export interface MonitoringStore {
  hasProcessed(key: string): Promise<boolean>;
  record(event: MonitoringEvent, key: string, outcome: MonitoringOutcome): Promise<void>;
  audit(event: MonitoringEvent, outcome: MonitoringOutcome, details: Record<string, unknown>): Promise<void>;
}

export interface MonitoringExecutionResult {
  outcome: MonitoringOutcome;
  idempotencyKey: string;
  attempts: number;
}

const MAX_RETRIES = 2;
const transient = (error: unknown) => error instanceof Error && error.name === "TransientMonitoringError";

/** Execute one authenticated, normalized event. No provider call is made here. */
export async function executeMonitoringEvent(
  event: MonitoringEvent,
  gate: MonitoringGate,
  adapters: readonly MonitoringAdapter[],
  store: MonitoringStore,
  dispatch: (event: MonitoringEvent) => Promise<void>,
): Promise<MonitoringExecutionResult> {
  const idempotencyKey = [event.tenantId, event.connectionId, event.eventId, event.employeeId, event.providerId, event.objectType, event.eventType].join(":");
  const safe = { eventId: event.eventId, tenantId: event.tenantId, employeeId: event.employeeId, connectionId: event.connectionId, providerId: event.providerId, objectType: event.objectType, eventType: event.eventType, provenance: event.provenance, payloadHash: event.payloadHash };
  const adapter = adapters.find((item) => item.providerId === event.providerId);
  let outcome: MonitoringOutcome;
  if (!event.authenticated || !event.eventId || !event.tenantId || !event.payloadHash || !event.occurredAt || !event.receivedAt) outcome = "skipped_unsupported";
  else if (gate.connectionTenantId !== event.tenantId || !gate.connectionActive) outcome = "skipped_unentitled";
  else if (!gate.purchased) outcome = "skipped_unentitled";
  else if (gate.employeeStatus !== "Active") outcome = gate.employeeStatus === "Paused" ? "skipped_paused" : "skipped_unentitled";
  else if (!adapter || !adapter.objectTypes.includes(event.objectType) || !adapter.eventTypes.includes(event.eventType)) outcome = "skipped_unsupported";
  else if (await store.hasProcessed(idempotencyKey)) outcome = "deduped";
  else {
    let attempts = 0;
    while (attempts <= MAX_RETRIES) {
      attempts++;
      try {
        await dispatch(event);
        outcome = "queued";
        await store.record(event, idempotencyKey, outcome);
        await store.audit(event, outcome, safe);
        return { outcome, idempotencyKey, attempts };
      } catch (error) {
        if (!transient(error) || attempts > MAX_RETRIES) {
          outcome = "failed";
          await store.record(event, idempotencyKey, outcome);
          await store.audit(event, outcome, { ...safe, error: "dispatch_failed" });
          return { outcome, idempotencyKey, attempts };
        }
      }
    }
    outcome = "failed";
  }
  await store.record(event, idempotencyKey, outcome);
  await store.audit(event, outcome, safe);
  return { outcome, idempotencyKey, attempts: 0 };
}
