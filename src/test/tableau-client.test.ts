import { describe, expect, it } from "vitest";
import { createTableauClient } from "../integrations/providers/tableau/client";

function makeClient() {
  return createTableauClient({ pat: "pat-1", serverUrl: "https://prod-useast-b.online.tableau.com", siteId: "site-1" } as never);
}

describe("Tableau client full capability surface", () => {
  it("hits the right site-scoped paths for read methods", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return {
        data: {
          workbooks: { workbook: [{ id: "w1" }] },
          datasources: { datasource: [{ id: "d1" }] },
          projects: { project: [{ id: "p1" }] },
          users: { user: [{ id: "u1" }] },
          views: { view: [{ id: "v1" }] },
          schedules: { schedule: [{ id: "s1" }] },
          flows: { flow: [{ id: "f1" }] },
          connections: { connection: [{ id: "c1" }] },
          workbook: { id: "w1" },
          datasource: { id: "d1" },
          project: { id: "p1" },
          user: { id: "u1" },
        },
      };
    };
    await c.listWorkbooks();
    await c.getWorkbook("w1");
    await c.listDatasources();
    await c.getDatasource("d1");
    await c.listProjects();
    await c.getProject("p1");
    await c.listUsers();
    await c.getUser("u1");
    await c.listViews();
    await c.listDashboards();
    await c.listSchedules();
    await c.listFlows();
    await c.listWorkbookConnections("w1");
    await c.listDatasourceConnections("d1");
    expect(calls).toContain("/sites/site-1/workbooks?pageSize=1000");
    expect(calls).toContain("/sites/site-1/workbooks/w1");
    expect(calls).toContain("/sites/site-1/datasources?pageSize=1000");
    expect(calls).toContain("/sites/site-1/datasources/d1");
    expect(calls).toContain("/sites/site-1/projects?pageSize=1000");
    expect(calls).toContain("/sites/site-1/projects/p1");
    expect(calls).toContain("/sites/site-1/users?pageSize=1000");
    expect(calls).toContain("/sites/site-1/users/u1");
    expect(calls).toContain("/sites/site-1/views?pageSize=1000");
    expect(calls.some((p) => p.includes("sheetType%3Aeq%3Adashboard"))).toBe(true);
    expect(calls).toContain("/sites/site-1/schedules?pageSize=1000");
    expect(calls).toContain("/sites/site-1/flows?pageSize=1000");
    expect(calls).toContain("/sites/site-1/workbooks/w1/connections");
    expect(calls).toContain("/sites/site-1/datasources/d1/connections");
  });

  it("monitor: listWorkbooksChangedSince encodes the updatedAt filter", async () => {
    const c = makeClient();
    let seen = "";
    (c as any).client.get = async (path: string) => {
      seen = path;
      return { data: { workbooks: { workbook: [{ id: "w1" }] } } };
    };
    const out = await c.listWorkbooksChangedSince("2026-01-01T00:00:00Z");
    expect(out.length).toBe(1);
    expect(seen).toContain("filter=");
    expect(seen).toContain("updatedAt%3Agte%3A2026-01-01T00%3A00%3A00Z");
  });

  it("monitor: listDatasourcesChangedSince and listDatasourceRefreshes hit datasource paths", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { datasources: { datasource: [{ id: "d1" }] }, jobs: { job: [{ id: "j1", status: "InProgress" }] } } };
    };
    await c.listDatasourcesChangedSince("2026-01-01T00:00:00Z");
    await c.listDatasourceRefreshes("d1");
    expect(calls[0]).toContain("lastUpdatedAt%3Agte%3A2026-01-01T00%3A00%3A00Z");
    expect(calls[1]).toBe("/sites/site-1/datasources/d1/refreshes");
  });

  it("write: createProject posts {project:{name,...}} to /projects", async () => {
    const c = makeClient();
    let posted: any = null;
    let path = "";
    (c as any).client.post = async (p: string, body: any) => {
      path = p;
      posted = JSON.parse(body);
      return { data: { project: { id: "new-p1", name: "proj" } } };
    };
    const out = await c.createProject({ name: "proj", description: "desc" });
    expect(out.id).toBe("new-p1");
    expect(path).toBe("/sites/site-1/projects");
    expect(posted.project.name).toBe("proj");
    expect(posted.project.description).toBe("desc");
  });

  it("write: updateProject and deleteProject use PUT/DELETE on the project path", async () => {
    const c = makeClient();
    let putBody: any = null;
    let putPath = "";
    let delPath = "";
    (c as any).client.put = async (p: string, body: any) => {
      putPath = p;
      putBody = JSON.parse(body);
      return { data: { project: { id: "p1" } } };
    };
    (c as any).client.delete = async (p: string) => {
      delPath = p;
      return { ok: true };
    };
    await c.updateProject("p1", { description: "new" });
    await c.deleteProject("p1");
    expect(putPath).toBe("/sites/site-1/projects/p1");
    expect(putBody.project.description).toBe("new");
    expect(delPath).toBe("/sites/site-1/projects/p1");
  });

  it("write: addSiteUser posts {user:{name,siteRole,authSetting}} and removeSiteUser deletes", async () => {
    const c = makeClient();
    let posted: any = null;
    let delPath = "";
    (c as any).client.post = async (_p: string, body: any) => {
      posted = JSON.parse(body);
      return { data: { user: { id: "u9" } } };
    };
    (c as any).client.delete = async (p: string) => {
      delPath = p;
      return { ok: true };
    };
    const out = await c.addSiteUser({ name: "a@example.com", siteRole: "Viewer" });
    expect(out.id).toBe("u9");
    expect(posted.user.name).toBe("a@example.com");
    expect(posted.user.siteRole).toBe("Viewer");
    expect(posted.user.authSetting).toBe("OpenID");
    await c.removeSiteUser("u9");
    expect(delPath).toBe("/sites/site-1/users/u9");
  });

  it("write: updateWorkbook PUTs {workbook:{name}} and refreshDatasource POSTs refresh", async () => {
    const c = makeClient();
    let putBody: any = null;
    let putPath = "";
    let refreshPath = "";
    (c as any).client.put = async (p: string, body: any) => {
      putPath = p;
      putBody = JSON.parse(body);
      return { data: { workbook: { id: "w1" } } };
    };
    (c as any).client.post = async (p: string) => {
      refreshPath = p;
      return { data: { job: { id: "j1", status: "Queued" } } };
    };
    await c.updateWorkbook("w1", { name: "renamed" });
    expect(putPath).toBe("/sites/site-1/workbooks/w1");
    expect(putBody.workbook.name).toBe("renamed");
    const job = await c.refreshDatasource("d1");
    expect(job.id).toBe("j1");
    expect(refreshPath).toBe("/sites/site-1/datasources/d1/refresh");
  });

  it("healthCheck returns false on failure instead of throwing", async () => {
    const c = makeClient();
    (c as any).client.get = async () => {
      throw new Error("down");
    };
    expect(await c.healthCheck()).toBe(false);
  });
});
