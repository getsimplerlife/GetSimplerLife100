import { describe, expect, it } from "vitest";
import { logisticsCapabilities, logisticsCapabilitiesExtended, readTasks, createTask, executeLogisticsCapability } from "../agents/capabilities/logistics";

const allContracts = [...logisticsCapabilities, ...logisticsCapabilitiesExtended];

describe("Logistics / Onfleet capability slice", () => {
  it("keeps all contracts unverified (code-complete, not yet tenant-verified)", () => {
    expect(allContracts.map((c) => c.status)).toEqual(Array(allContracts.length).fill("unverified"));
  });

  it("covers understand, monitor, and automate kinds with onfleet- prefixed ids", () => {
    expect(allContracts.length).toBe(11);
    const ids = allContracts.map((c) => c.capabilityId);
    expect(ids).toContain("onfleet-read-tasks");
    expect(ids).toContain("onfleet-read-workers");
    expect(ids).toContain("onfleet-read-teams");
    expect(ids).toContain("onfleet-read-routes");
    expect(ids).toContain("onfleet-read-destinations");
    expect(ids).toContain("onfleet-monitor-tasks");
    expect(ids).toContain("onfleet-monitor-workers");
    expect(ids).toContain("onfleet-create-task");
    expect(ids).toContain("onfleet-update-task-status");
    expect(ids).toContain("onfleet-complete-task");
    expect(ids).toContain("onfleet-create-worker");
    const kinds = allContracts.map((c) => c.kind);
    expect(kinds.filter((k) => k === "understand")).toHaveLength(5);
    expect(kinds.filter((k) => k === "monitor")).toHaveLength(2);
    expect(kinds.filter((k) => k === "automate")).toHaveLength(4);
  });

  it("fails closed without tenant or auth", async () => {
    const a = { listTasks: async () => [] } as any;
    await expect(readTasks(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readTasks(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("retries bounded reads and audits", async () => {
    let calls = 0;
    const out: string[] = [];
    const r = await readTasks(
      {
        listTasks: async (t: string) => {
          calls++;
          expect(t).toBe("t");
          if (calls < 2) throw Error("temporary");
          return ["task"];
        },
      },
      { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) },
    );
    expect(r).toEqual(["task"]);
    expect(calls).toBe(2);
    expect(out).toEqual(["succeeded"]);
  });

  it("requires idempotency and audits failed writes", async () => {
    const out: string[] = [];
    const a = { createTask: async () => { throw Error("unavailable"); } };
    await expect(createTask(a, {}, { tenantId: "t", authToken: "token", audit: (e) => out.push(e.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(createTask(a, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(out).toEqual(["failed"]);
  });

  it("extended reads retry and audit through the typed dispatcher", async () => {
    let calls = 0;
    const out: string[] = [];
    const adapter = {
      readWorkers: async (tenantId: string) => {
        calls++;
        if (calls < 2) throw Error("temporary");
        return ["worker"];
      },
    } as any;
    const r = await executeLogisticsCapability(adapter, "onfleet-read-workers", {
      tenantId: "t",
      authToken: "token",
      maxAttempts: 2,
      audit: (e) => out.push(e.outcome),
    });
    expect(r).toEqual(["worker"]);
    expect(calls).toBe(2);
    expect(out).toEqual(["succeeded"]);
  });

  it("monitor executors fail closed without tenant/auth", async () => {
    const adapter = { monitorTasks: async () => ["t1"] } as any;
    await expect(
      executeLogisticsCapability(adapter, "onfleet-monitor-tasks", { tenantId: "", authToken: "x", audit: () => {} }),
    ).rejects.toThrow("Tenant scope");
    await expect(
      executeLogisticsCapability(adapter, "onfleet-monitor-tasks", { tenantId: "t", audit: () => {} }),
    ).rejects.toThrow("authentication");
  });

  it("extended writes require an idempotency key and audit failures", async () => {
    const out: string[] = [];
    const adapter = {
      completeTask: async () => { throw Error("boom"); },
    } as any;
    await expect(
      executeLogisticsCapability(adapter, "onfleet-complete-task", { tenantId: "t", authToken: "token", audit: (e) => out.push(e.outcome) }),
    ).rejects.toThrow("Idempotency");
    await expect(
      executeLogisticsCapability(adapter, "onfleet-complete-task", {
        tenantId: "t",
        authToken: "token",
        idempotencyKey: "k",
        maxAttempts: 2,
        audit: (e) => out.push(e.outcome),
      }),
    ).rejects.toThrow("boom");
    expect(out).toEqual(["failed"]);
  });

  it("write contracts declare proper safety properties", () => {
    for (const c of allContracts.filter((c) => c.kind === "automate")) {
      expect(c.tenantScoped).toBe(true);
      expect(c.authRequired).toBe(true);
      expect(c.auditRequired).toBe(true);
      expect(c.idempotencyRequired).toBe(true);
      expect(c.retryPolicy).toBe("bounded");
      expect(c.rollback).toBe("available");
    }
  });

  it("unknown extended capability ids fail closed", async () => {
    await expect(
      executeLogisticsCapability({} as any, "onfleet-unknown-thing", { tenantId: "t", authToken: "x", audit: () => {} }),
    ).rejects.toThrow(/Unsupported capability|not a function/);
  });
});
