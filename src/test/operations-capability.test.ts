import { describe, expect, it } from "vitest";
import { operationsCapabilities, readBoards, createItem } from "../agents/capabilities/operations";

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
