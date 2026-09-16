import { beforeEach, describe, expect, it } from "vitest";
import { clearSeen, isDuplicate, markSeen } from "../monitoring/dedupe";
import { acquireLease, clearLeases, isLeased, releaseLease } from "../monitoring/lease";
import { clearTenants, configureTenant } from "../monitoring/gates";
import { dispatch } from "../monitoring/dispatcher";
import type { MonitoredEvent } from "../monitoring/types";
const event: MonitoredEvent = { id: "event-1", employeeId: "support", providerId: "zendesk", eventType: "ticket.created", payload: {}, receivedAt: new Date().toISOString(), tenantId: "tenant-1" };
describe("monitoring foundation", () => {
  beforeEach(() => { clearSeen(); clearLeases(); clearTenants(); });
  it("deduplicates events", () => { expect(isDuplicate(event)).toBe(false); markSeen(event); expect(isDuplicate(event)).toBe(true); });
  it("acquires, releases, and expires leases", async () => { expect(acquireLease("e", "h", 5)).toBe(true); expect(isLeased("e")).toBe(true); expect(releaseLease("e", "h")).toBe(true); expect(isLeased("e")).toBe(false); expect(acquireLease("x", "h", 1)).toBe(true); await new Promise((r) => setTimeout(r, 3)); expect(isLeased("x")).toBe(false); });
  it("rejects an inactive tenant", async () => { const result = await dispatch(event, { employeeId: "support", providerId: "zendesk", eventTypes: ["ticket.created"] }, { holderId: "h", execute: async () => {} }); expect(result.status).toBe("failed"); });
  it("processes entitled events and rejects signatures", async () => { configureTenant("tenant-1", { purchased: true, status: "Active" }); const config = { employeeId: "support", providerId: "zendesk", eventTypes: ["ticket.created"], webhookSecret: "secret" }; const rejected = await dispatch({ ...event, signature: "bad" }, config, { holderId: "h", verifySignature: () => false, execute: async () => {} }); expect(rejected.status).toBe("failed"); const result = await dispatch({ ...event, signature: "ok" }, config, { holderId: "h", verifySignature: () => true, execute: async () => {} }); expect(result.status).toBe("processed"); });
});
