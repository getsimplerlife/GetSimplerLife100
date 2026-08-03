import { describe, expect, it } from "vitest";
import { operationsCapabilities, operationsCapabilitiesExtended, readBoards, createItem, monitorItemCreated } from "../agents/capabilities/operations";
describe("Operations / Monday.com capability slice", () => {
  it("keeps contracts unverified", () => expect(operationsCapabilities.map((c) => c.status)).toEqual(["unverified", "unverified"]));
  it("fails closed without tenant or auth", async () => {
    const adapter = { listBoards: async () => [] } as any;
    await expect(readBoards(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readBoards(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });
  it("retries bounded reads and audits", async () => {
    let calls = 0;
    const outcomes: string[] = [];
    const result = await readBoards({ listBoards: async (tenantId) => { calls++; expect(tenantId).toBe("t"); if (calls < 2) throw Error("temporary"); return ["board"]; } }, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) });
    expect(result).toEqual(["board"]);
    expect(calls).toBe(2);
    expect(outcomes).toEqual(["succeeded"]);
  });
  it("requires idempotency and audits failed writes", async () => {
    const outcomes: string[] = [];
    const adapter = { createItem: async () => { throw Error("unavailable"); } };
    await expect(createItem(adapter, {}, { tenantId: "t", authToken: "token", audit: (event) => outcomes.push(event.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(createItem(adapter, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(outcomes).toEqual(["failed"]);
  });
});
describe("Operations / Monday.com extended capability slice", () => {
  const extendedIds = operationsCapabilitiesExtended.map((c) => c.capabilityId);
  const opts = { tenantId: "t", authToken: "token", audit: () => {} };
  it("covers the 8-contract matrix with fail-closed contracts", () => {
    for (const id of ["monday-read-column-values", "monday-update-column-values", "monday-move-item", "monday-read-subitems", "monday-read-workspaces", "monday-monitor-item-created"]) {
      expect(extendedIds).toContain(id);
    }
    expect(operationsCapabilitiesExtended.length).toBe(6);
    expect([...operationsCapabilities, ...operationsCapabilitiesExtended].length).toBe(8);
  });
  it("runs extended reads with audit", async () => {
    const { executeExtendedCapability } = await import("../agents/capabilities/operations");
    const adapter = {
      readColumnValues: async () => [{ column: "status", value: "working" }],
      readSubitems: async () => [{ id: "s1" }],
      readWorkspaces: async () => [{ id: "w1", name: "Ops" }],
    };
    for (const id of ["monday-read-column-values", "monday-read-subitems", "monday-read-workspaces"]) {
      const result = await executeExtendedCapability(adapter as any, id, opts);
      expect(result).toBeDefined();
    }
  });
  it("enforces idempotency for every automate write contract (monday-move-item included)", async () => {
    const { executeExtendedCapability } = await import("../agents/capabilities/operations");
    const adapter = {
      updateColumnValues: async () => ({ updated: true }),
      moveItem: async () => ({ moved: true }),
    };
    for (const id of ["monday-update-column-values", "monday-move-item"]) {
      await expect(executeExtendedCapability(adapter as any, id, { ...opts, idempotencyKey: "" })).rejects.toThrow("Idempotency");
    }
    const ok = await executeExtendedCapability(adapter as any, "monday-move-item", { ...opts, idempotencyKey: "k1" });
    expect(ok).toEqual({ moved: true });
  });
  it("fails closed when the monitor adapter method is unavailable", async () => {
    await expect(monitorItemCreated({} as any, opts as any, {})).rejects.toThrow("unavailable");
  });
  it("runs the monitor executor with audit when the adapter method exists", async () => {
    const outcomes: string[] = [];
    const adapter = { monitorItemCreated: async () => ({ recentItemCount: 3 }) };
    const result = await monitorItemCreated(adapter as any, { tenantId: "t", authToken: "token", audit: (e) => { outcomes.push(e.outcome); } }, { boardId: 1 });
    expect(result).toEqual({ recentItemCount: 3 });
    expect(outcomes).toEqual(["succeeded"]);
  });
});
