import { describe, expect, it } from "vitest";
import { MarketoClient, createMarketoClient } from "../integrations/providers/marketo/client";

function makeClient() {
  return new MarketoClient("token-1", "123-abc-456.mktorest.com");
}

describe("Marketo client full capability surface", () => {
  it("constructor requires accessToken and restEndpoint", () => {
    expect(() => new MarketoClient("", "ep")).toThrow("accessToken");
    expect(() => new MarketoClient("tok", "")).toThrow("restEndpoint");
  });

  it("builds correct base URL and auth headers", () => {
    const c = makeClient();
    expect((c as any).accessToken).toBe("token-1");
    expect((c as any).restEndpoint).toBe("123-abc-456.mktorest.com");
    expect((c as any).headers["Authorization"]).toBe("Bearer token-1");
    expect((c as any).headers["Content-Type"]).toBe("application/json");
  });

  it("hits canonical Marketo REST paths for read methods", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { result: [{ id: 1 }] }, ok: true };
    };

    await c.listCampaigns();
    expect(calls).toContain("/asset/v1/campaigns.json");

    await c.listCampaigns({ offset: 10, maxReturn: 50 });
    expect(calls).toContain("/asset/v1/campaigns.json?offset=10&maxReturn=50");

    await c.getCampaign(123);
    expect(calls).toContain("/asset/v1/campaign/123.json");

    await c.listPrograms();
    expect(calls).toContain("/asset/v1/programs.json");

    await c.getProgram(456);
    expect(calls).toContain("/asset/v1/program/456.json");

    await c.listEmails();
    expect(calls).toContain("/asset/v1/emails.json");

    await c.getEmail(789);
    expect(calls).toContain("/asset/v1/email/789.json");

    await c.listLists();
    expect(calls).toContain("/asset/v1/staticLists.json");
  });

  it("hits lead and metrics paths", async () => {
    const c = makeClient();
    const calls: string[] = [];
    (c as any).client.get = async (path: string) => {
      calls.push(path);
      return { data: { result: [] }, ok: true };
    };

    await c.listLeads();
    expect(calls).toContain("/v1/leads.json");

    await c.listLeads({ filterType: "email", filterValues: ["a@b.com"] } as any);
    expect(calls.some((p) => p.includes("filterType=email"))).toBe(true);

    await c.getLead(42, ["email", "leadScore"]);
    expect(calls.some((p) => p.includes("/v1/lead/42.json"))).toBe(true);

    await c.getEmailMetrics(5);
    expect(calls.some((p) => p.includes("/v1/stats/email.json"))).toBe(true);

    await c.getEmailSummaryStats();
    expect(calls).toContain("/v1/stats/email.json");
  });

  it("posts to write endpoints", async () => {
    const c = makeClient();
    const posts: string[] = [];
    (c as any).client.post = async (path: string) => {
      posts.push(path);
      return { data: { result: [{ status: "added" }] }, ok: true };
    };

    await c.sendSampleEmail(1, "test@example.com");
    expect(posts).toContain("/asset/v1/email/1/sendSample.json");

    await c.addLeadsToList(10, [1, 2, 3]);
    expect(posts).toContain("/v1/lists/10/leads.json");

    await c.triggerCampaign(20, [5]);
    expect(posts).toContain("/v1/campaigns/20/trigger.json");
  });

  it("createMarketoClient validates credentials", () => {
    expect(() => createMarketoClient({} as any)).toThrow("accessToken");
    expect(() => createMarketoClient({ accessToken: "tok" } as any)).toThrow("restEndpoint");
    const c = createMarketoClient({ accessToken: "x", restEndpoint: "ep" } as any);
    expect(c).toBeInstanceOf(MarketoClient);
  });

  it("healthCheck uses a lightweight read", async () => {
    const c = makeClient();
    let path = "";
    (c as any).client.get = async (p: string) => {
      path = p;
      return { ok: true, data: { result: [] } };
    };
    expect(await c.healthCheck()).toBe(true);
    expect(path).toBe("/asset/v1/programs.json?maxReturn=1");
  });

  it("fails closed on unknown paths (HttpClient throws)", async () => {
    const c = makeClient();
    (c as any).client.get = async () => {
      throw new Error("Not Found");
    };
    await expect(c.listCampaigns()).rejects.toThrow("Not Found");
  });
});
