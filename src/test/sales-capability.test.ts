import { describe, expect, it } from "vitest";
import { salesCapabilities, readOpportunities, updateOpportunity, monitorPipeline } from "../agents/capabilities/sales";

describe("Sales / Salesforce capability slice", () => {
  it("has 10 contracts (5 understand, 4 automate, 1 monitor)", () => {
    expect(salesCapabilities.length).toBe(10);
    expect(salesCapabilities.filter(c => c.kind === "understand").length).toBe(5);
    expect(salesCapabilities.filter(c => c.kind === "automate").length).toBe(4);
    expect(salesCapabilities.filter(c => c.kind === "monitor").length).toBe(1);
  });

  it("keeps contracts unverified", () =>
    expect(salesCapabilities.every((c) => c.status === "unverified")).toBe(true));

  it("has monitor contract with correct capabilityId", () => {
    const monitor = salesCapabilities.find(c => c.capabilityId === "salesforce-monitor-pipeline");
    expect(monitor).toBeDefined();
    expect(monitor!.kind).toBe("monitor");
    expect(monitor!.retryPolicy).toBe("bounded");
  });

  it("fails closed without tenant or auth", async () => {
    const adapter = { listOpportunities: async () => [] } as any;
    await expect(readOpportunities(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readOpportunities(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("retries bounded reads and audits", async () => {
    let calls = 0;
    const outcomes: string[] = [];
    const result = await readOpportunities(
      {
        listOpportunities: async (tenantId) => {
          calls++;
          expect(tenantId).toBe("t");
          if (calls < 2) throw Error("temporary");
          return ["opportunity"];
        },
      },
      { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) },
    );
    expect(result).toEqual(["opportunity"]);
    expect(calls).toBe(2);
    expect(outcomes).toEqual(["succeeded"]);
  });

  it("requires idempotency and audits failed writes", async () => {
    const outcomes: string[] = [];
    const adapter = { updateOpportunity: async () => { throw Error("unavailable"); } };
    await expect(
      updateOpportunity(adapter, {}, { tenantId: "t", authToken: "token", audit: (event) => outcomes.push(event.outcome) }, ""),
    ).rejects.toThrow("Idempotency");
    await expect(
      updateOpportunity(adapter, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }, "k"),
    ).rejects.toThrow("unavailable");
    expect(outcomes).toEqual(["failed"]);
  });

  it("monitor fails closed without tenant or auth", async () => {
    const adapter = { monitorPipeline: async () => ({ monitored: 0 }) } as any;
    await expect(monitorPipeline(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(monitorPipeline(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("monitor retries and audits on success", async () => {
    let calls = 0;
    const outcomes: string[] = [];
    const result = await monitorPipeline(
      {
        monitorPipeline: async (tenantId) => {
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
    const adapter = { monitorPipeline: async () => { throw Error("down"); } };
    await expect(
      monitorPipeline(adapter, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }),
    ).rejects.toThrow("down");
    expect(outcomes).toEqual(["failed"]);
  });

  it("all 10 capabilityIds are valid salesforce- prefixed IDs", () => {
    const knownIds = salesCapabilities.map(c => c.capabilityId);
    expect(knownIds.length).toBe(10);
    expect(knownIds).toContain("salesforce-monitor-pipeline");
    expect(knownIds.every(id => id.startsWith("salesforce-"))).toBe(true);
  });
});
