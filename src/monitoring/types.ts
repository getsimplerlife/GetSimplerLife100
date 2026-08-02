export interface MonitorConfig { employeeId: string; providerId: string; eventTypes: string[]; webhookSecret?: string; pollIntervalMs?: number; }
export interface MonitoredEvent { id: string; employeeId: string; providerId: string; eventType: string; payload: unknown; receivedAt: string; signature?: string; tenantId?: string; }
export interface Lease { eventId: string; holderId: string; acquiredAt: string; expiresAt: string; }
export interface EventOutcome { eventId: string; status: "processed" | "skipped" | "failed"; reason?: string; dispatchedTo?: string; }
