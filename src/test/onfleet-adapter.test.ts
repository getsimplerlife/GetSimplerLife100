import { describe, expect, it, vi, beforeEach } from "vitest";
import { onfleetAdapter } from "../verification/adapters/priority";
import type { AdapterContext } from "../verification/adapters";

function jsonResponse(data: unknown, status = 200) {
  return { ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => data } as unknown as Response;
}
/** Recorded Onfleet API calls (method + url + parsed body). */
const calls: Array<{ method: string; url: string; body?: any }> = [];
function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    credentials: { apiKey: "key-1" },
    allowWrites: true,
    ...overrides,
  } as AdapterContext;
}
const contract = (capabilityId: string) => ({ capabilityId } as never);
function installFetch(handler: (method: string, url: string, body?: any) => Response) {
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url);
    const method = (init?.method || "GET") as string;
    let body: any;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = String(init.body);
      }
    }
    calls.push({ method, url: u, body });
    return handler(method, u, body);
  }) as unknown as typeof fetch;
}
const defaultRoutes = (method: string, url: string) => {
  if (method === "GET" && url.includes("/tasks")) return jsonResponse([{ id: "t1" }, { id: "t2" }]);
  if (method === "GET" && url.includes("/workers")) return jsonResponse([{ id: "w1" }]);
  if (method === "GET" && url.includes("/teams")) return jsonResponse([{ id: "tm1", name: "Team 1" }]);
  if (method === "GET" && url.includes("/containers")) return jsonResponse({ tasks: [{ id: "r1" }, { id: "r2" }] });
  if (method === "GET" && url.includes("/destinations")) return jsonResponse([{ id: "d1" }]);
  if (method === "POST" && url.endsWith("/tasks")) return jsonResponse({ id: "t-new" }, 201);
  if (method === "PUT" && url.includes("/tasks")) return jsonResponse({ id: "t-new", notes: "updated" });
  if (method === "POST" && url.includes("/complete")) return jsonResponse({ id: "t-new", state: "completed" });
  if (method === "DELETE" && url.includes("/tasks")) return jsonResponse({}, 204);
  if (method === "POST" && url.endsWith("/workers")) return jsonResponse({ id: "w-new" }, 201);
  if (method === "DELETE" && url.includes("/workers")) return jsonResponse({}, 204);
  return jsonResponse({});
};

describe("Onfleet verification adapter (real client, mocked transport)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch(defaultRoutes);
  });

  it("read contracts return counts", async () => {
    const tasks = await onfleetAdapter(contract("onfleet-read-tasks"), ctx());
    expect(tasks).toEqual({ httpStatus: 200, response: { count: 2 } });
    const workers = await onfleetAdapter(contract("onfleet-read-workers"), ctx());
    expect(workers.response).toEqual({ count: 1 });
    const teams = await onfleetAdapter(contract("onfleet-read-teams"), ctx());
    expect(teams.response).toEqual({ count: 1 });
    const destinations = await onfleetAdapter(contract("onfleet-read-destinations"), ctx());
    expect(destinations.response).toEqual({ count: 1 });
  });

  it("read-routes reads the first team container (route)", async () => {
    const r = await onfleetAdapter(contract("onfleet-read-routes"), ctx());
    expect(r.response).toEqual({ count: 2, teamId: "tm1" });
    expect(calls.map((c) => c.url)).toContain("https://onfleet.com/api/v2/containers/tm1");
  });

  it("read-routes fails closed when the org has no teams", async () => {
    installFetch((method, url) => {
      if (method === "GET" && url.includes("/teams")) return jsonResponse([]);
      return jsonResponse({});
    });
    await expect(onfleetAdapter(contract("onfleet-read-routes"), ctx())).rejects.toThrow(/no teams/);
  });

  it("monitor contracts use a 24h window and return monitored counts", async () => {
    const m = await onfleetAdapter(contract("onfleet-monitor-tasks"), ctx());
    expect(m.response).toEqual({ monitored: 2, window: "24h" });
    const taskCalls = calls.filter((c) => c.method === "GET" && c.url.includes("/tasks"));
    expect(taskCalls[0].url).toMatch(/from=\d+/);
    const w = await onfleetAdapter(contract("onfleet-monitor-workers"), ctx());
    expect(w.response).toEqual({ monitored: 1 });
  });

  it("write gate — fails without --writes and makes no network calls", async () => {
    calls.length = 0;
    await expect(onfleetAdapter(contract("onfleet-create-task"), ctx({ allowWrites: false }))).rejects.toThrow(/write verification disabled/);
    await expect(onfleetAdapter(contract("onfleet-create-worker"), ctx({ allowWrites: false }))).rejects.toThrow(/write verification disabled/);
    expect(calls).toHaveLength(0);
  });

  it("create-task creates a labeled task and leaves it in place (non-destructive)", async () => {
    const r = await onfleetAdapter(contract("onfleet-create-task"), ctx());
    expect(r).toEqual({ httpStatus: 201, response: { created: true, kept: true, taskId: "t-new" } });
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/tasks"))!;
    expect(post.body.notes).toMatch(/Phase7-VERIFY/);
    // Zero DELETE requests — artifacts are left in place (owner mandate).
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });
  it("update-task-status creates and updates (no delete)", async () => {
    const r = await onfleetAdapter(contract("onfleet-update-task-status"), ctx());
    expect(r.response.updated).toBe(true);
    expect(r.response.kept).toBe(true);
    const order = calls.filter((c) => c.url.includes("/tasks")).map((c) => c.method);
    expect(order).toEqual(["POST", "PUT"]);
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.body.notes).toMatch(/updated$/);
  });
  it("complete-task creates and completes (no delete)", async () => {
    const r = await onfleetAdapter(contract("onfleet-complete-task"), ctx());
    expect(r.response).toMatchObject({ completed: true, taskId: "t-new", kept: true });
    const order = calls.filter((c) => c.url.includes("/tasks")).map((c) => c.method + " " + c.url);
    expect(order[0]).toContain("POST");
    expect(order[1]).toContain("POST");
    expect(order[1]).toContain("/complete");
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });
  it("create-worker creates a labeled worker and leaves it in place", async () => {
    const r = await onfleetAdapter(contract("onfleet-create-worker"), ctx());
    expect(r).toEqual({ httpStatus: 201, response: { created: true, kept: true, workerId: "w-new" } });
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/workers"))!;
    expect(post.body.name).toMatch(/Phase7-VERIFY/);
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });
  it("leaves artifacts in place even when the client is fine (no rollback branch)", async () => {
    // No DELETE route is provided/needed — the adapter never issues one.
    const r = await onfleetAdapter(contract("onfleet-create-task"), ctx());
    expect(r.response.kept).toBe(true);
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });
  it("fails closed without an api key", async () => {
    calls.length = 0;
    await expect(onfleetAdapter(contract("onfleet-read-tasks"), ctx({ credentials: {} }))).rejects.toThrow(/no apiKey/);
    expect(calls).toHaveLength(0);
  });

  it("unknown capability ids fail closed without network calls", async () => {
    calls.length = 0;
    await expect(onfleetAdapter(contract("onfleet-make-coffee"), ctx())).rejects.toThrow(/no verification path/);
    expect(calls).toHaveLength(0);
  });
});
