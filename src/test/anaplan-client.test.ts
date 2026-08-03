import { describe, expect, it } from "vitest";
import { AnaplanClient, createAnaplanClient } from "../integrations/providers/anaplan/client";

function makeClient() {
  return new AnaplanClient("token-1", "ws-1");
}

describe("Anaplan client full capability surface", () => {
  it("constructor requires authToken", () => {
    expect(() => new AnaplanClient("")).toThrow("authToken");
  });

  it("builds correct base URL and auth headers", () => {
    const c = makeClient();
    expect((c as any).authToken).toBe("token-1");
    expect((c as any).workspaceId).toBe("ws-1");
    expect((c as any).headers["Authorization"]).toBe("AnaplanAuthToken token-1");
    expect((c as any).headers["Content-Type"]).toBe("application/json");
  });

  it("hits canonical Anaplan API paths", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { workspaces: [], models: [], modules: [], views: [], scenarios: [], processes: [] }, ok: true };
    };
    (c as any).client.post = async (path: string) => {
      calls.push(path);
      return { data: {}, ok: true };
    };
    (c as any).client.put = async (path: string) => {
      calls.push(path);
      return { data: {}, ok: true };
    };

    await c.listWorkspaces();
    expect(calls).toContain("/workspaces");

    await c.listModels("ws-1");
    expect(calls).toContain("/workspaces/ws-1/models");

    await c.getModel("m1", "ws-1");
    expect(calls).toContain("/workspaces/ws-1/models/m1");

    await c.listModules("m1", "ws-1");
    expect(calls).toContain("/workspaces/ws-1/models/m1/modules");

    await c.listViews("m1", "ws-1");
    expect(calls).toContain("/workspaces/ws-1/models/m1/views");

    await c.listScenarios("m1", "ws-1");
    expect(calls).toContain("/workspaces/ws-1/models/m1/scenarios");

    await c.getActualsVsBudget("m1", "ws-1");
    expect(calls).toContain("/workspaces/ws-1/models/m1/processes");

    await c.createImport("m1", {}, "ws-1");
    expect(calls).toContain("/workspaces/ws-1/models/m1/imports");

    await c.updateCellData("m1", "v1", {}, "ws-1");
    expect(calls).toContain("/workspaces/ws-1/models/m1/views/v1/data");
  });

  it("createAnaplanClient validates credentials", () => {
    expect(() => createAnaplanClient({} as any)).toThrow("authToken");
    const c = createAnaplanClient({ authToken: "x", workspaceId: "w" } as any);
    expect(c).toBeInstanceOf(AnaplanClient);
  });

  it("healthCheck uses /workspaces", async () => {
    const c = makeClient();
    let path = "";
    (c as any).client.get = async (p: string) => { path = p; return { ok: true }; };
    expect(await c.healthCheck()).toBe(true);
    expect(path).toBe("/workspaces");
  });

  it("fails closed on unknown paths", async () => {
    const c = makeClient();
    (c as any).client.get = async () => { throw new Error("Not Found"); };
    await expect(c.listWorkspaces()).rejects.toThrow("Not Found");
  });
});
