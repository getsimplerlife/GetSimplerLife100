import { describe, expect, it } from "vitest";
import {
  itOperationsCapabilities,
  readIncidents,
  createIncident,
  readChangeRequests,
  readProblems,
  readCmdbAssets,
  updateIncidentSeverity,
  updateIncidentAssignment,
  monitorIncidentCreated,
} from "../agents/capabilities/it-operations";

const CONTRACT_IDS = [
  "servicenow-read-incidents",
  "servicenow-create-incident",
  "servicenow-read-change-requests",
  "servicenow-read-problems",
  "servicenow-read-cmdb-assets",
  "servicenow-update-incident-severity",
  "servicenow-update-incident-assignment",
  "servicenow-monitor-incident-created",
];

describe("IT Operations / ServiceNow capability slice", () => {
  it("keeps contracts unverified", () =>
    expect(itOperationsCapabilities.every((c) => c.status === "unverified")).toBe(true));

  it("declares the full 8-contract matrix (4 understand, 3 automate, 1 monitor)", () => {
    expect(itOperationsCapabilities.map((c) => c.capabilityId)).toEqual(CONTRACT_IDS);
    const kinds = itOperationsCapabilities.map((c) => c.kind);
    expect(kinds.filter((k) => k === "understand")).toHaveLength(4);
    expect(kinds.filter((k) => k === "automate")).toHaveLength(3);
    expect(kinds.filter((k) => k === "monitor")).toHaveLength(1);
    // All contracts are tenant-scoped, auth-required and audit-required.
    for (const c of itOperationsCapabilities) {
      expect(c.tenantScoped).toBe(true);
      expect(c.authRequired).toBe(true);
      expect(c.auditRequired).toBe(true);
    }
  });

  it("fails closed without tenant or auth", async () => {
    const adapter = { listIncidents: async () => [] } as any;
    await expect(readIncidents(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readIncidents(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("retries bounded reads and audits", async () => {
    let calls = 0;
    const outcomes: string[] = [];
    const result = await readIncidents(
      {
        listIncidents: async (tenantId) => {
          calls++;
          expect(tenantId).toBe("t");
          if (calls < 2) throw Error("temporary");
          return ["incident"];
        },
      },
      { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) },
    );
    expect(result).toEqual(["incident"]);
    expect(calls).toBe(2);
    expect(outcomes).toEqual(["succeeded"]);
  });

  it("requires idempotency and audits failed writes", async () => {
    const outcomes: string[] = [];
    const adapter = { createIncident: async () => { throw Error("unavailable"); } };
    await expect(createIncident(adapter, {}, { tenantId: "t", authToken: "token", audit: (event) => outcomes.push(event.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(createIncident(adapter, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(outcomes).toEqual(["failed"]);
  });

  it("executes extended reads with audit", async () => {
    const outcomes: string[] = [];
    const adapter = {
      readChangeRequests: async () => ["change-request"],
      readProblems: async () => ["problem"],
      readCmdbAssets: async () => ["cmdb-asset"],
    };
    const base = { tenantId: "t", authToken: "token", audit: (event: any) => outcomes.push(event.outcome) };
    await expect(readChangeRequests(adapter as any, base)).resolves.toEqual(["change-request"]);
    await expect(readProblems(adapter as any, base)).resolves.toEqual(["problem"]);
    await expect(readCmdbAssets(adapter as any, base)).resolves.toEqual(["cmdb-asset"]);
    expect(outcomes).toEqual(["succeeded", "succeeded", "succeeded"]);
  });

  it("requires idempotency and audits for both update writes", async () => {
    const outcomes: string[] = [];
    const adapter = {
      updateIncidentSeverity: async () => { throw Error("unavailable"); },
      updateIncidentAssignment: async () => { throw Error("unavailable"); },
    };
    const base = { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event: any) => outcomes.push(event.outcome) };
    await expect(updateIncidentSeverity(adapter as any, base, {}, "")).rejects.toThrow("Idempotency");
    await expect(updateIncidentSeverity(adapter as any, base, {}, "k")).rejects.toThrow("unavailable");
    await expect(updateIncidentAssignment(adapter as any, base, {}, "")).rejects.toThrow("Idempotency");
    await expect(updateIncidentAssignment(adapter as any, base, {}, "k")).rejects.toThrow("unavailable");
    expect(outcomes).toEqual(["failed", "failed"]);
  });

  it("monitor fails closed when adapter method is unavailable", async () => {
    await expect(
      monitorIncidentCreated({} as any, { tenantId: "t", authToken: "token", audit: () => {} }, {}),
    ).rejects.toThrow("Capability adapter method is unavailable");
  });

  it("monitor returns result with audit when adapter method exists", async () => {
    const outcomes: string[] = [];
    const adapter = { monitorIncidentCreated: async () => ({ recentCount: 3 }) };
    const result = await monitorIncidentCreated(
      adapter as any,
      { tenantId: "t", authToken: "token", audit: (event) => outcomes.push(event.outcome) },
      { boardId: "abc" },
    );
    expect(result).toEqual({ recentCount: 3 });
    expect(outcomes).toEqual(["succeeded"]);
  });

  it("monitor still enforces tenant scope", async () => {
    const adapter = { monitorIncidentCreated: async () => ({ recentCount: 0 }) };
    await expect(
      monitorIncidentCreated(adapter as any, { tenantId: "", authToken: "token", audit: () => {} }, {}),
    ).rejects.toThrow("Tenant scope");
  });
});
