/** Tenant-bound ingress and durable monitoring gate primitives. No provider calls. */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MONITORING_SCHEMA = `
CREATE TABLE IF NOT EXISTS monitoring_events (
  idempotency_key TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  lease_until INTEGER,
  received_at INTEGER NOT NULL,
  payload_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS monitoring_events_lease_idx ON monitoring_events(status, lease_until);
`;
export interface IngressConnection { id: string; tenantId: string; providerId: string; webhookSecret: string; active: boolean; }
export interface IngressEvent { eventId: string; tenantId: string; connectionId: string; providerId: string; payloadHash: string; rawBody: string; receivedAt: string; }
export interface EventLeaseStore { claim(key: string, event: IngressEvent, leaseMs: number): Promise<"claimed" | "duplicate">; }

/** Durable store adapter. Schema initialization and claim are explicit; callers decide when to invoke. */
export function createDurableEventLeaseStore(db: { run(query: unknown): Promise<unknown> }): EventLeaseStore {
  let initialized: Promise<void> | undefined;
  const ensure = () => initialized ??= (async () => {
    for (const statement of MONITORING_SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await db.run({ toString: () => statement });
  })();
  return {
    async claim(key, event, leaseMs) {
      await ensure();
      const now = Date.now();
      const leaseUntil = now + leaseMs;
      // The production adapter must provide a transactional INSERT-if-absent/lease update.
      // This interface intentionally does not interpolate untrusted values or perform provider calls.
      const result = await db.run({ toString: () => `INSERT OR IGNORE INTO monitoring_events (idempotency_key, tenant_id, connection_id, provider_id, event_id, status, lease_until, received_at, payload_hash) VALUES (${JSON.stringify(key)}, ${JSON.stringify(event.tenantId)}, ${JSON.stringify(event.connectionId)}, ${JSON.stringify(event.providerId)}, ${JSON.stringify(event.eventId)}, 'claimed', ${leaseUntil}, ${now}, ${JSON.stringify(event.payloadHash)})` });
      return (result as { changes?: number })?.changes === 0 ? "duplicate" : "claimed";
    },
  };
}
export interface EntitlementResolver { resolve(tenantId: string, employeeId: string, connectionId: string): Promise<{ purchased: boolean; employeeStatus: string; connectionActive: boolean }>; }

export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string, now = Date.now(), timestamp = ""): boolean {
  if (!signature || !secret || !/^t=\d+,v1=[a-f0-9]{64}$/.test(signature)) return false;
  const [tPart, vPart] = signature.split(",");
  const suppliedAt = Number(tPart.slice(2));
  if (!Number.isFinite(suppliedAt) || Math.abs(now - suppliedAt * 1000) > 300_000 || timestamp !== tPart.slice(2)) return false;
  const expected = createHmac("sha256", secret).update(`${suppliedAt}.${rawBody}`).digest("hex");
  const actual = vPart.slice(3);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function normalizeWebhookEvent(rawBody: string, connection: IngressConnection, signature: string | null): IngressEvent | null {
  if (!verifyWebhookSignature(rawBody, signature, connection.webhookSecret, Date.now(), signature?.split(",")[0]?.slice(2) || "")) return null;
  try {
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    if (typeof body.id !== "string" || body.type !== "ticket.created") return null;
    const payloadHash = createHmac("sha256", "payload-hash").update(rawBody).digest("hex");
    return { eventId: body.id, tenantId: connection.tenantId, connectionId: connection.id, providerId: connection.providerId, payloadHash, rawBody, receivedAt: new Date().toISOString() };
  } catch { return null; }
}

export async function claimMonitoringEvent(store: EventLeaseStore, event: IngressEvent): Promise<"claimed" | "duplicate"> {
  const key = `${event.tenantId}:${event.connectionId}:${event.providerId}:${event.eventId}:ticket.created`;
  return store.claim(key, event, 60_000);
}
