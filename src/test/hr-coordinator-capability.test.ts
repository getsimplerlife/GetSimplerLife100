import { describe, expect, it } from "vitest";
import {
  hrCoordinatorCapabilities,
  readEmployees,
  updateEmployee,
  readOrgChart,
  readTimeOff,
  readPositions,
  readJobRequisitions,
  initiateOnboarding,
  approveTimeOff,
  createJobRequisition,
  monitorEmployees,
} from "../agents/capabilities/hr-coordinator";

describe("HR Coordinator / Workday capability slice", () => {
  it("has 10 contracts (5 understand, 4 automate, 1 monitor)", () => {
    expect(hrCoordinatorCapabilities.length).toBe(10);
    expect(hrCoordinatorCapabilities.filter(c => c.kind === "understand").length).toBe(5);
    expect(hrCoordinatorCapabilities.filter(c => c.kind === "automate").length).toBe(4);
    expect(hrCoordinatorCapabilities.filter(c => c.kind === "monitor").length).toBe(1);
  });

  it("keeps contracts unverified", () =>
    expect(hrCoordinatorCapabilities.every(c => c.status === "unverified")).toBe(true));

  it("has monitor contract with correct capabilityId", () => {
    const monitor = hrCoordinatorCapabilities.find(c => c.capabilityId === "workday-monitor-employees");
    expect(monitor).toBeDefined();
    expect(monitor!.kind).toBe("monitor");
    expect(monitor!.retryPolicy).toBe("bounded");
  });

  /* ── fail-closed ── */
  it("fails closed without tenant or auth", async () => {
    const adapter = { listEmployees: async () => [] } as any;
    await expect(readEmployees(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readEmployees(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  /* ── retry ── */
  it("retries bounded reads and audits", async () => {
    let calls = 0;
    const outcomes: string[] = [];
    const result = await readEmployees(
      {
        listEmployees: async (tenantId) => {
          calls++;
          expect(tenantId).toBe("t");
          if (calls < 2) throw Error("temporary");
          return ["employee"];
        },
      },
      { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) },
    );
    expect(result).toEqual(["employee"]);
    expect(calls).toBe(2);
    expect(outcomes).toEqual(["succeeded"]);
  });

  /* ── idempotency ── */
  it("requires idempotency and audits failed writes", async () => {
    const outcomes: string[] = [];
    const adapter = { updateEmployee: async () => { throw Error("unavailable"); } };
    await expect(
      updateEmployee(adapter, {}, { tenantId: "t", authToken: "token", audit: (event) => outcomes.push(event.outcome) }, ""),
    ).rejects.toThrow("Idempotency");
    await expect(
      updateEmployee(adapter, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }, "k"),
    ).rejects.toThrow("unavailable");
    expect(outcomes).toEqual(["failed"]);
  });

  /* ── monitor fail-closed ── */
  it("monitor fails closed without tenant or auth", async () => {
    const adapter = { monitorEmployees: async () => ({ monitored: 0 }) } as any;
    await expect(monitorEmployees(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(monitorEmployees(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  /* ── monitor retry ── */
  it("monitor retries and audits on success", async () => {
    let calls = 0;
    const outcomes: string[] = [];
    const result = await monitorEmployees(
      {
        monitorEmployees: async (tenantId) => {
          calls++;
          expect(tenantId).toBe("t");
          if (calls < 2) throw Error("transient");
          return { monitored: 3 };
        },
      },
      { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) },
    );
    expect(result).toEqual({ monitored: 3 });
    expect(calls).toBe(2);
    expect(outcomes).toEqual(["succeeded"]);
  });

  it("monitor audits failure after all retries", async () => {
    const outcomes: string[] = [];
    const adapter = { monitorEmployees: async () => { throw Error("down"); } };
    await expect(
      monitorEmployees(adapter, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }),
    ).rejects.toThrow("down");
    expect(outcomes).toEqual(["failed"]);
  });

  /* ── all IDs valid ── */
  it("all 10 capabilityIds are valid workday- prefixed IDs", () => {
    const knownIds = hrCoordinatorCapabilities.map(c => c.capabilityId);
    expect(knownIds.length).toBe(10);
    expect(knownIds).toContain("workday-monitor-employees");
    expect(knownIds.every(id => id.startsWith("workday-"))).toBe(true);
  });

  /* ── extended capabilities ── */
  it("readOrgChart fails without tenant", async () => {
    const adapter = { readOrgChart: async () => [{ name: "CEO" }] } as any;
    await expect(readOrgChart(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
  });

  it("initiateOnboarding requires idempotency key", async () => {
    const adapter = { initiateOnboarding: async () => ({ status: "started" }) } as any;
    await expect(
      initiateOnboarding(adapter, { tenantId: "t", authToken: "token", audit: () => {} }, {}, ""),
    ).rejects.toThrow("Idempotency");
  });
});
