import { describe, expect, it } from "vitest";
import { createOnfleetClient } from "../integrations/providers/onfleet/client";

function makeClient() {
  return createOnfleetClient({ apiKey: "key-1" } as never);
}

describe("Onfleet client full capability surface", () => {
  it("uses Basic auth with apiKey as username (empty password)", () => {
    const c = makeClient();
    const expected = `Basic ${Buffer.from("key-1:").toString("base64")}`;
    expect((c as any).headers.Authorization).toBe(expected);
  });

  it("hits the canonical v2 host for read methods", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return {
        data: [
          { id: "t1", type: "delivery" },
          { id: "t2", type: "delivery" },
        ],
      };
    };
    const tasks = await c.listTasks();
    expect(calls).toContain("/tasks");
    expect(tasks).toHaveLength(2);
    await c.listTasks({ from: 1000, to: 2000 });
    expect(calls).toContain("/tasks?from=1000&to=2000");
    await c.getTask("t1");
    expect(calls).toContain("/tasks/t1");
    await c.listWorkers();
    expect(calls).toContain("/workers");
    await c.getWorker("w1");
    expect(calls).toContain("/workers/w1");
    await c.listTeams();
    expect(calls).toContain("/teams");
    await c.getTeam("tm1");
    expect(calls).toContain("/teams/tm1");
    await c.listDestinations();
    expect(calls).toContain("/destinations");
    await c.listRecipients();
    expect(calls).toContain("/recipients");
    await c.getOrganization();
    expect(calls).toContain("/organizations");
    await c.getContainer("tm1");
    expect(calls).toContain("/containers/tm1");
  });

  it("unwrapList handles wrapped responses (workers object)", async () => {
    const c = makeClient();
    (c as any).client.get = async () => ({ data: { workers: [{ id: "w1" }] } });
    const workers = await c.listWorkers();
    expect(workers).toEqual([{ id: "w1" }]);
  });

  it("listTasksChangedSince passes the epoch-ms window as from/to", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: [{ id: "t1" }] };
    };
    await c.listTasksChangedSince(111, 222);
    expect(calls).toContain("/tasks?from=111&to=222");
  });

  it("posts create/update payloads to the right paths", async () => {
    const c = makeClient();
    const calls: Array<{ method: string; path: string; body: string }> = [];
    (c as any).client.post = async (path: string, body: string) => {
      calls.push({ method: "post", path, body });
      return { data: { id: "t-new" } };
    };
    (c as any).client.put = async (path: string, body: string) => {
      calls.push({ method: "put", path, body });
      return { data: { id: "t-new", notes: "x" } };
    };
    (c as any).client.delete = async (path: string) => {
      calls.push({ method: "delete", path, body: "" });
      return { ok: true };
    };
    await c.createTask({ destination: { address: { street: "1 Main St", city: "Town", country: "US" } }, notes: "deliver" });
    await c.updateTask("t1", { notes: "updated" });
    await c.completeTask("t1");
    await c.deleteTask("t1");
    await c.createWorker({ name: "Driver", phone: "+15550100" });
    await c.deleteWorker("w1");
    const post = calls.filter((x) => x.method === "post");
    expect(post.map((x) => x.path)).toContain("/tasks");
    expect(post.map((x) => x.path)).toContain("/tasks/t1/complete");
    expect(post.map((x) => x.path)).toContain("/workers");
    const taskCreate = post.find((x) => x.path === "/tasks")!;
    expect(JSON.parse(taskCreate.body).destination.address.street).toBe("1 Main St");
    const put = calls.find((x) => x.method === "put")!;
    expect(put.path).toBe("/tasks/t1");
    expect(JSON.parse(put.body).notes).toBe("updated");
    const del = calls.filter((x) => x.method === "delete").map((x) => x.path);
    expect(del).toContain("/tasks/t1");
    expect(del).toContain("/workers/w1");
  });

  it("deleteTask reflects the transport ok flag", async () => {
    const c = makeClient();
    (c as any).client.delete = async () => ({ ok: true });
    expect(await c.deleteTask("t1")).toBe(true);
    (c as any).client.delete = async () => ({ ok: false });
    expect(await c.deleteTask("t1")).toBe(false);
  });

  it("healthCheck returns false instead of throwing", async () => {
    const c = makeClient();
    (c as any).client.get = async () => {
      throw new Error("down");
    };
    expect(await c.healthCheck()).toBe(false);
    (c as any).client.get = async () => ({ ok: true });
    expect(await c.healthCheck()).toBe(true);
  });

  it("createOnfleetClient fails closed without an api key", () => {
    expect(() => createOnfleetClient({} as never)).toThrow(/no apiKey/);
  });
});
