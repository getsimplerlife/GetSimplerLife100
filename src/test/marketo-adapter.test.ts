import { describe, expect, it, vi, beforeEach } from "vitest";
import { marketoAdapter } from "../verification/adapters/priority";
import type { AdapterContext } from "../verification/adapters";

function jsonResponse(data: unknown, status = 200) {
  return { ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => data } as unknown as Response;
}
const calls: Array<{ method: string; url: string; body?: any }> = [];
function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return { credentials: { accessToken: "tok", restEndpoint: "ep.mktorest.com" }, allowWrites: true, ...overrides } as AdapterContext;
}
const contract = (id: string) => ({ capabilityId: id } as never);

function installFetch(handler: (method: string, url: string, body?: any) => Response) {
  globalThis.fetch = vi.fn(async (url: any, init: any) => {
    const u = String(url); const m = (init?.method || "GET") as string; let b: any;
    if (init?.body) { try { b = JSON.parse(String(init.body)); } catch { b = String(init.body); } }
    calls.push({ method: m, url: u, body: b }); return handler(m, u, b);
  }) as unknown as typeof fetch;
}
const routes = (m: string, u: string) => {
  if (m === "GET" && u.includes("campaigns.json")) return jsonResponse({ result: [{ id: 1 }] });
  if (m === "GET" && u.includes("programs.json")) return jsonResponse({ result: [{ id: 2 }] });
  if (m === "GET" && u.includes("emails.json")) return jsonResponse({ result: [{ id: 3 }] });
  if (m === "GET" && u.includes("leads.json")) return jsonResponse({ result: [{ id: 4, leadScore: 80 }] });
  if (m === "GET" && u.includes("stats/email.json")) return jsonResponse({ result: [{ sent: 100 }] });
  if (m === "GET" && u.includes("staticLists.json")) return jsonResponse({ result: [{ id: 10 }] });
  if (m === "POST" && u.includes("sendSample.json")) return jsonResponse({ success: true });
  if (m === "POST" && u.includes("/lists/")) return jsonResponse({ result: [{ status: "added" }] });
  if (m === "DELETE" && u.includes("/lists/")) return jsonResponse({ result: [{ status: "removed" }] });
  if (m === "POST" && u.includes("/trigger.json")) return jsonResponse({ result: [{ status: "queued" }] });
  return jsonResponse({});
};

describe("Marketo verification adapter", () => {
  beforeEach(() => { calls.length = 0; installFetch(routes); });

  it("rejects missing credentials", async () => {
    await expect(marketoAdapter(contract("marketo-read-campaigns"), { credentials: {}, allowWrites: false } as AdapterContext)).rejects.toThrow("accessToken");
    await expect(marketoAdapter(contract("marketo-read-campaigns"), { credentials: { accessToken: "tok" }, allowWrites: false } as AdapterContext)).rejects.toThrow("restEndpoint");
  });

  it("read campaigns returns count", async () => {
    expect(await marketoAdapter(contract("marketo-read-campaigns"), ctx())).toEqual({ httpStatus: 200, response: { count: 1 } });
  });
  it("read programs returns count", async () => {
    expect(await marketoAdapter(contract("marketo-read-programs"), ctx())).toEqual({ httpStatus: 200, response: { count: 1 } });
  });
  it("read assets returns count", async () => {
    expect(await marketoAdapter(contract("marketo-read-assets"), ctx())).toEqual({ httpStatus: 200, response: { count: 1 } });
  });
  it("read lead scores returns count", async () => {
    expect(await marketoAdapter(contract("marketo-read-lead-scores"), ctx())).toEqual({ httpStatus: 200, response: { count: 1 } });
  });
  it("read email metrics returns hasStats", async () => {
    expect(await marketoAdapter(contract("marketo-read-email-metrics"), ctx())).toEqual({ httpStatus: 200, response: { hasStats: true } });
  });

  it("send email fails closed without --writes", async () => {
    await expect(marketoAdapter(contract("marketo-send-email"), { ...ctx(), allowWrites: false })).rejects.toThrow("write verification disabled");
  });
  it("send email with writes enabled", async () => {
    expect(await marketoAdapter(contract("marketo-send-email"), ctx())).toEqual({ httpStatus: 200, response: { sent: true, emailId: 3 } });
  });

  it("add to list fails closed without --writes", async () => {
    await expect(marketoAdapter(contract("marketo-add-to-list"), { ...ctx(), allowWrites: false })).rejects.toThrow("write verification disabled");
  });
  it("add to list with writes + rollback", async () => {
    expect(await marketoAdapter(contract("marketo-add-to-list"), ctx())).toEqual({ httpStatus: 200, response: { added: true, rolledBack: true, listId: 10, leadId: 4 } });
    expect(calls.some(c => c.method === "DELETE")).toBe(true);
  });

  it("add to nurture fails closed without --writes", async () => {
    await expect(marketoAdapter(contract("marketo-add-to-nurture"), { ...ctx(), allowWrites: false })).rejects.toThrow("write verification disabled");
  });
  it("add to nurture with writes enabled", async () => {
    expect(await marketoAdapter(contract("marketo-add-to-nurture"), ctx())).toEqual({ httpStatus: 200, response: { triggered: true, campaignId: 1, leadId: 4 } });
  });

  it("unknown capability fails closed", async () => {
    await expect(marketoAdapter(contract("marketo-bogus"), ctx())).rejects.toThrow("no verification path for marketo-bogus");
  });

  it("all requests hit canonical mktorest.com host", async () => {
    await marketoAdapter(contract("marketo-read-campaigns"), ctx());
    expect(calls.some(c => c.url.includes("ep.mktorest.com"))).toBe(true);
  });
});
