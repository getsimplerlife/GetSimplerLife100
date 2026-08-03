import { describe, expect, it } from "vitest";
import {
  itOperationsCapabilities,
  readIncidents,
  createIncident,
  monitorIncidentCreated,
  readKnowledgeBase,
  createChangeRequest,
} from "../agents/capabilities/it-operations";

describe("IT Operations / ServiceNow capability slice", () => {
  it("has 10 contracts (5 understand, 4 automate, 1 monitor)", () => {
    expect(itOperationsCapabilities.length).toBe(10);
    expect(itOperationsCapabilities.filter(c => c.kind === "understand").length).toBe(5);
    expect(itOperationsCapabilities.filter(c => c.kind === "automate").length).toBe(4);
    expect(itOperationsCapabilities.filter(c => c.kind === "monitor").length).toBe(1);
  });

  it("keeps contracts unverified", () =>
    expect(itOperationsCapabilities.every(c => c.status === "unverified")).toBe(true));

  /* ── fail-closed ── */
  it("fails closed without tenant or auth", async () => {
    const adapter = { listIncidents: async () => [] } as any;
    await expect(readIncidents(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readIncidents(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  /* ── retry ── */
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

  /* ── idempotency ── */
  it("requires idempotency and audits failed writes", async () => {
    const outcomes: string[] = [];
    const adapter = { createIncident: async () => { throw Error("unavailable"); } };
    await expect(
      createIncident(adapter, {}, { tenantId: "t", authToken: "token", audit: (event) => outcomes.push(event.outcome) }, ""),
    ).rejects.toThrow("Idempotency");
    await expect(
      createIncident(adapter, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }, "k"),
    ).rejects.toThrow("unavailable");
    expect(outcomes).toEqual(["failed"]);
  });

  /* ── monitor ── */
  it("monitor succeeds with adapter method", async () => {
    const result = await monitorIncidentCreated(
      { monitorIncidentCreated: async () => ({ recentCount: 3 }) },
      { tenantId: "t", authToken: "token", audit: () => {} },
      {},
    );
    expect(result).toEqual({ recentCount: 3 });
  });

  it("monitor fails when adapter method missing", async () => {
    await expect(
      monitorIncidentCreated({} as any, { tenantId: "t", authToken: "token", audit: () => {} }, {}),
    ).rejects.toThrow("unavailable");
  });

  /* ── new contracts ── */
  it("readKnowledgeBase succeeds with adapter", async () => {
    const result = await readKnowledgeBase(
      { readKnowledgeBase: async () => [{ title: "KB article" }] },
      { tenantId: "t", authToken: "token", audit: () => {} },
    );
    expect(result).toEqual([{ title: "KB article" }]);
  });

  it("readKnowledgeBase fails when adapter method missing", async () => {
    await expect(
      readKnowledgeBase({} as any, { tenantId: "t", authToken: "token", audit: () => {} }),
    ).rejects.toThrow("unavailable");
  });

  it("createChangeRequest requires idempotency", async () => {
    await expect(
      createChangeRequest({} as any, { tenantId: "t", authToken: "token", audit: () => {} }, {}, ""),
    ).rejects.toThrow("Idempotency");
  });

  /* ── all IDs valid ── */
  it("all 10 capabilityIds are valid servicenow- prefixed IDs", () => {
    const knownIds = itOperationsCapabilities.map(c => c.capabilityId);
    expect(knownIds.length).toBe(10);
    expect(knownIds.every(id => id.startsWith("servicenow-"))).toBe(true);
    expect(knownIds).toContain("servicenow-read-knowledge-base");
    expect(knownIds).toContain("servicenow-create-change-request");
  });
});
