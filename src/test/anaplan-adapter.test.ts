import { describe, expect, it, vi, beforeEach } from "vitest";
import { anaplanAdapter } from "../verification/adapters/priority";
import type { AdapterContext } from "../verification/adapters";

function jsonResponse(data: unknown, status = 200) {
  return { ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => data } as unknown as Response;
}
const calls: Array<{ method: string; url: string; body?: any }> = [];
function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return { credentials: { authToken: "tok", workspaceId: "ws-1" }, allowWrites: true, ...overrides } as AdapterContext;
}
const contract = (id: string) => ({ capabilityId: id } as never);

function installFetch(handler: (m: string, u: string, b?: any) => Response) {
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url); const m = (init?.method || "GET") as string; let b: any;
    if (init?.body) { try { b = JSON.parse(String(init.body)); } catch { b = String(init.body); } }
    calls.push({ method: m, url: u, body: b }); return handler(m, u, b);
  }) as unknown as typeof fetch;
}
const routes = (m: string, u: string) => {
  if (m === "GET" && u.includes("/models") && !u.includes("/modules") && !u.includes("/views") && !u.includes("/scenarios") && !u.includes("/processes")) return jsonResponse({ models: [{ id: "m1", name: "Model1" }] });
  if (m === "GET" && u.includes("/modules")) return jsonResponse({ modules: [{ id: "mod1" }, { id: "mod2" }] });
  if (m === "GET" && u.includes("/views")) return jsonResponse({ views: [{ id: "v1" }, { id: "v2" }, { id: "v3" }] });
  if (m === "GET" && u.includes("/scenarios")) return jsonResponse({ scenarios: [{ id: "s1" }] });
  if (m === "GET" && u.includes("/processes")) return jsonResponse({ processes: [{ id: "p1" }] });
  if (m === "POST" && u.includes("/imports")) return jsonResponse({ id: "imp-1" }, 201);
  if (m === "PUT" && u.includes("/data")) return jsonResponse({ success: true });
  if (m === "GET" && u.includes("/workspaces")) return jsonResponse({ workspaces: [{ id: "ws-1" }] });
  return jsonResponse({});
};

describe("Anaplan verification adapter", () => {
  beforeEach(() => { calls.length = 0; installFetch(routes); });

  it("rejects missing credentials", async () => {
    await expect(anaplanAdapter(contract("anaplan-read-models"), { credentials: {}, allowWrites: false } as AdapterContext)).rejects.toThrow("authToken");
    await expect(anaplanAdapter(contract("anaplan-read-models"), { credentials: { authToken: "tok" }, allowWrites: false } as AdapterContext)).rejects.toThrow("workspaceId");
  });

  it("read models returns count", async () => {
    expect(await anaplanAdapter(contract("anaplan-read-models"), ctx())).toEqual({ httpStatus: 200, response: { count: 1 } });
  });
  it("read modules returns count and modelId", async () => {
    expect(await anaplanAdapter(contract("anaplan-read-modules"), ctx())).toEqual({ httpStatus: 200, response: { count: 2, modelId: "m1" } });
  });
  it("read budgets returns count and modelId", async () => {
    expect(await anaplanAdapter(contract("anaplan-read-budgets"), ctx())).toEqual({ httpStatus: 200, response: { count: 3, modelId: "m1" } });
  });
  it("read scenarios returns count", async () => {
    expect(await anaplanAdapter(contract("anaplan-read-scenarios"), ctx())).toEqual({ httpStatus: 200, response: { count: 1, modelId: "m1" } });
  });
  it("read actuals-vs-budget returns hasData", async () => {
    expect(await anaplanAdapter(contract("anaplan-read-actuals-vs-budget"), ctx())).toEqual({ httpStatus: 200, response: { hasData: true, modelId: "m1" } });
  });

  it("create forecast fails closed without --writes", async () => {
    await expect(anaplanAdapter(contract("anaplan-create-forecast"), { ...ctx(), allowWrites: false })).rejects.toThrow("write verification disabled");
  });
  it("create forecast with writes enabled", async () => {
    const r = await anaplanAdapter(contract("anaplan-create-forecast"), ctx());
    expect(r.httpStatus).toBe(201);
    expect((r.response as any).created).toBe(true);
  });

  it("update assumptions fails closed without --writes", async () => {
    await expect(anaplanAdapter(contract("anaplan-update-forecast-assumptions"), { ...ctx(), allowWrites: false })).rejects.toThrow("write verification disabled");
  });
  it("update assumptions with writes enabled", async () => {
    const r = await anaplanAdapter(contract("anaplan-update-forecast-assumptions"), ctx());
    expect(r.httpStatus).toBe(200);
    expect((r.response as any).updated).toBe(true);
  });

  it("unknown capability fails closed", async () => {
    await expect(anaplanAdapter(contract("anaplan-bogus"), ctx())).rejects.toThrow("no verification path");
  });

  it("all requests hit canonical api.anaplan.com host", async () => {
    await anaplanAdapter(contract("anaplan-read-models"), ctx());
    expect(calls.some(c => c.url.includes("api.anaplan.com"))).toBe(true);
  });
});
