import { describe, expect, it } from "vitest";
import {
  analyticsCapabilities,
  readReports,
  readDashboards,
  readWorkbooks,
  readDataSources,
  readProjects,
  readUsers,
  monitorWorkbooks,
  monitorDatasources,
  createProject,
  addSiteUser,
} from "../agents/capabilities/analytics";

describe("Analytics / Tableau capability slice", () => {
  it("keeps all 12 contracts unverified", () => {
    expect(analyticsCapabilities.length).toBe(12);
    expect(analyticsCapabilities.every((c) => c.status === "unverified")).toBe(true);
  });

  it("covers understand, monitor, and automate kinds with valid tableau- prefixed IDs", () => {
    const ids = analyticsCapabilities.map((c) => c.capabilityId);
    expect(ids.every((id) => id.startsWith("tableau-"))).toBe(true);
    expect(ids.filter((id) => id.startsWith("tableau-read-")).length).toBe(6);
    expect(ids.filter((id) => id.startsWith("tableau-monitor-")).length).toBe(2);
    expect(ids.filter((id) => id.startsWith("tableau-") && !id.startsWith("tableau-read-") && !id.startsWith("tableau-monitor-")).length).toBe(4);
    expect(analyticsCapabilities.filter((c) => c.kind === "understand").length).toBe(6);
    expect(analyticsCapabilities.filter((c) => c.kind === "monitor").length).toBe(2);
    expect(analyticsCapabilities.filter((c) => c.kind === "automate").length).toBe(4);
  });

  it("fails closed without tenant or auth", async () => {
    const adapter = { listReports: async () => [] } as any;
    await expect(readReports(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readReports(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("retries bounded reads and audits", async () => {
    let calls = 0;
    const outcomes: string[] = [];
    const result = await readReports(
      {
        listReports: async (tenantId) => {
          calls++;
          expect(tenantId).toBe("t");
          if (calls < 2) throw Error("temporary");
          return ["report"];
        },
      },
      { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) },
    );
    expect(result).toEqual(["report"]);
    expect(calls).toBe(2);
    expect(outcomes).toEqual(["succeeded"]);
  });

  it("read projects and users require tenant scope", async () => {
    const adapter = { readProjects: async () => [], readUsers: async () => [] } as any;
    await expect(readProjects(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readUsers(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("monitor fails closed without tenant or auth", async () => {
    const adapter = { monitorWorkbooks: async () => ({ monitored: 0 }) } as any;
    await expect(monitorWorkbooks(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(monitorWorkbooks(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("monitor retries and audits on success", async () => {
    let calls = 0;
    const outcomes: string[] = [];
    const result = await monitorWorkbooks(
      {
        monitorWorkbooks: async (tenantId) => {
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
    const adapter = { monitorDatasources: async () => { throw Error("down"); } };
    await expect(
      monitorDatasources(adapter, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }),
    ).rejects.toThrow("down");
    expect(outcomes).toEqual(["failed"]);
  });

  it("writes require an idempotency key", async () => {
    const adapter = { createProject: async () => ({ id: "p1" }), addSiteUser: async () => ({ id: "u1" }) } as any;
    await expect(createProject(adapter, { tenantId: "t", authToken: "token", audit: () => {} }, { name: "x" }, "")).rejects.toThrow("Idempotency");
    await expect(addSiteUser(adapter, { tenantId: "t", authToken: "token", audit: () => {} }, { name: "a@x.com" }, "")).rejects.toThrow("Idempotency");
  });

  it("writes audit success with the idempotency key", async () => {
    const outcomes: string[] = [];
    const adapter = { createProject: async () => ({ id: "p1" }) } as any;
    const result = await createProject(
      adapter,
      { tenantId: "t", authToken: "token", audit: (e: any) => outcomes.push(`${e.outcome}:${e.idempotencyKey}`) },
      { name: "proj" },
      "key-123",
    );
    expect(result).toEqual({ id: "p1" });
    expect(outcomes).toEqual(["succeeded:key-123"]);
  });

  it("automate contracts declare tenant scope, auth, audit, idempotency, bounded retry, and rollback", () => {
    for (const c of analyticsCapabilities.filter((c) => c.kind === "automate")) {
      expect(c.tenantScoped).toBe(true);
      expect(c.authRequired).toBe(true);
      expect(c.auditRequired).toBe(true);
      expect(c.idempotencyRequired).toBe(true);
      expect(c.retryPolicy).toBe("bounded");
      expect(c.rollback).not.toBe("not_applicable");
    }
  });
});
