import { describe, expect, it, vi, beforeEach } from "vitest";
import { tableauAdapter } from "../verification/adapters/priority";
import type { AdapterContext } from "../verification/adapters";

function jsonResponse(data: unknown, status = 200) {
  return { ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => data } as unknown as Response;
}

/** Recorded Tableau API calls (method + url + parsed body). */
const calls: Array<{ method: string; url: string; body?: any }> = [];

function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    credentials: { pat: "pat-1", serverUrl: "https://prod-useast-b.online.tableau.com", siteId: "site-1" },
    allowWrites: true,
    ...overrides,
  } as AdapterContext;
}

const createProjectContract = { capabilityId: "tableau-create-project" } as never;
const updateWorkbookContract = { capabilityId: "tableau-update-workbook" } as never;
const addSiteUserContract = { capabilityId: "tableau-add-site-user" } as never;
const refreshDatasourceContract = { capabilityId: "tableau-refresh-datasource" } as never;
const readContract = { capabilityId: "tableau-read-workbooks" } as never;

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

describe("Tableau verification adapter (real client, mocked transport)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch((method, url) => {
      if (method === "GET" && url.includes("/workbooks")) return jsonResponse({ workbooks: { workbook: [{ id: "w1", name: "Orig" }] } });
      if (method === "GET" && url.includes("/datasources")) return jsonResponse({ datasources: { datasource: [{ id: "d1" }] } });
      if (method === "GET" && url.includes("/refreshes")) return jsonResponse({ jobs: { job: [{ id: "j0", status: "Success" }] } });
      if (method === "GET" && url.includes("/views")) return jsonResponse({ views: { view: [{ id: "v1" }] } });
      if (method === "GET" && url.includes("/projects")) return jsonResponse({ projects: { project: [{ id: "p0" }] } });
      if (method === "GET" && url.includes("/users")) return jsonResponse({ users: { user: [{ id: "u0" }] } });
      if (method === "POST" && url.includes("/projects")) return jsonResponse({ project: { id: "new-p1" } }, 201);
      if (method === "DELETE" && url.includes("/projects/")) return jsonResponse({}, 200);
      if (method === "POST" && url.includes("/users")) return jsonResponse({ user: { id: "new-u1" } }, 201);
      if (method === "DELETE" && url.includes("/users/")) return jsonResponse({}, 200);
      if (method === "PUT" && url.includes("/workbooks/")) return jsonResponse({ workbook: { id: "w1" } });
      if (method === "POST" && url.includes("/refresh")) return jsonResponse({ job: { id: "job-1", status: "Queued" } }, 202);
      return { ok: false, status: 404 } as unknown as Response;
    });
  });

  it("fails closed for writes without --writes (no API calls made)", async () => {
    await expect(tableauAdapter(createProjectContract, ctx({ allowWrites: false }))).rejects.toThrow("write verification disabled");
    await expect(tableauAdapter(updateWorkbookContract, ctx({ allowWrites: false }))).rejects.toThrow("write verification disabled");
    await expect(tableauAdapter(addSiteUserContract, ctx({ allowWrites: false }))).rejects.toThrow("write verification disabled");
    await expect(tableauAdapter(refreshDatasourceContract, ctx({ allowWrites: false }))).rejects.toThrow("write verification disabled");
    expect(calls.length).toBe(0);
  });

  it("create-project creates a labeled project and leaves it in place (non-destructive)", async () => {
    const out = await tableauAdapter(createProjectContract, ctx());
    expect(out).toMatchObject({ httpStatus: 201, response: { created: true, kept: true, projectId: "new-p1" } });
    const created = calls.find((c) => c.method === "POST" && c.url.includes("/projects"));
    expect(created?.body.project.name).toContain("Phase7-VERIFY");
    // Zero DELETE requests — artifacts are left in place (owner mandate).
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });
  it("update-workbook renames with a label then restores the original name", async () => {
    const out = await tableauAdapter(updateWorkbookContract, ctx());
    expect(out).toMatchObject({ httpStatus: 200, response: { updated: true, workbookId: "w1" } });
    const puts = calls.filter((c) => c.method === "PUT" && c.url.includes("/workbooks/w1"));
    expect(puts.length).toBe(2);
    expect(puts[0].body.workbook.name).toContain("Phase7-VERIFY");
    expect(puts[1].body.workbook.name).toBe("Orig");
  });

  it("add-site-user creates a labeled viewer and leaves it in place (non-destructive)", async () => {
    const out = await tableauAdapter(addSiteUserContract, ctx());
    expect(out).toMatchObject({ httpStatus: 201, response: { created: true, kept: true, userId: "new-u1" } });
    const created = calls.find((c) => c.method === "POST" && c.url.includes("/users"));
    expect(created?.body.user.name).toContain("@verify.example.invalid");
    expect(created?.body.user.siteRole).toBe("Viewer");
    // Zero DELETE requests — the labeled user is left in place (owner mandate).
    expect(calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });
  it("refresh-datasource starts a refresh job on the first datasource", async () => {
    const out = await tableauAdapter(refreshDatasourceContract, ctx());
    expect(out).toMatchObject({ httpStatus: 200, response: { refreshed: true, datasourceId: "d1", jobId: "job-1" } });
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/datasources/d1/refresh"))).toBe(true);
  });

  it("read contracts return counts", async () => {
    const out = await tableauAdapter(readContract, ctx());
    expect(out).toMatchObject({ httpStatus: 200, response: { count: 1 } });
  });

  it("fails closed when the credential has no pat", async () => {
    await expect(tableauAdapter(readContract, ctx({ credentials: { serverUrl: "https://x", siteId: "s" } }))).rejects.toThrow("no pat/apiToken");
  });

  it("fails closed when the credential has no serverUrl or siteId", async () => {
    await expect(tableauAdapter(readContract, ctx({ credentials: { pat: "p", siteId: "s" } }))).rejects.toThrow("no serverUrl");
    await expect(tableauAdapter(readContract, ctx({ credentials: { pat: "p", serverUrl: "https://x" } }))).rejects.toThrow("no siteId");
  });
});
