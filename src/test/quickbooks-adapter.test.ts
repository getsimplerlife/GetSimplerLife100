import { describe, expect, it, vi, beforeEach } from "vitest";
import { quickbooksAdapter } from "../verification/adapters/quickbooks";
import type { AdapterContext } from "../verification/adapters";

function jsonResponse(data: unknown, status = 200) {
  return { ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => data } as unknown as Response;
}
/** Recorded QBO API calls (method + url + parsed body). */
const calls: Array<{ method: string; url: string; body?: any }> = [];
function ctx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    credentials: { accessToken: "tok-1", refreshToken: "rt-1", companyId: "123456" },
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
  const inv = (n: number) => jsonResponse({ QueryResponse: { Invoice: Array.from({ length: n }, (_, i) => ({ Id: `inv-${i}` })) } });
  const cust = (n: number) => jsonResponse({ QueryResponse: { Customer: Array.from({ length: n }, (_, i) => ({ Id: `cust-${i}` })) } });
  const acct = () => jsonResponse({ QueryResponse: { Account: [{ Id: "acct-1", AccountType: "Expense" }] } });
  if (method === "GET" && url.includes("/query") && url.includes("FROM%20Invoice")) return inv(2);
  if (method === "GET" && url.includes("/query") && url.includes("FROM%20Customer")) return cust(1);
  if (method === "GET" && url.includes("/query") && url.includes("FROM%20Bill")) return jsonResponse({ QueryResponse: { Bill: [{ Id: "b1" }] } });
  if (method === "GET" && url.includes("/query") && url.includes("FROM%20Account")) return acct();
  if ((method === "POST") && url.includes("/invoice?minorversion=73")) return jsonResponse({ Invoice: { Id: "inv-new", DocNumber: "D-1" } }, 201);
  if ((method === "POST") && url.includes("/estimate?minorversion=73")) return jsonResponse({ Estimate: { Id: "est-new", DocNumber: "D-2" } }, 201);
  if ((method === "POST") && url.includes("/customer?minorversion=73")) return jsonResponse({ Customer: { Id: "cust-new", DisplayName: "X" } }, 201);
  return jsonResponse({});
};

describe("QuickBooks Online verification adapter (real client, mocked transport)", () => {
  beforeEach(() => {
    calls.length = 0;
    installFetch(defaultRoutes);
  });

  it("read contracts return counts against canonical host", async () => {
    const inv = await quickbooksAdapter(contract("quickbooks-read-invoices"), ctx());
    expect(inv).toEqual({ httpStatus: 200, response: { count: 2 } });
    const cust = await quickbooksAdapter(contract("quickbooks-read-customers"), ctx());
    expect(cust.response).toEqual({ count: 1 });
    const bills = await quickbooksAdapter(contract("quickbooks-read-bills"), ctx());
    expect(bills.response).toEqual({ count: 1 });
    const acct = await quickbooksAdapter(contract("quickbooks-read-chart-of-accounts"), ctx());
    expect(acct.response).toEqual({ count: 1 });
    // canonical host is always the QBO company endpoint
    const q = calls.find((c) => c.url.includes("/query"))!;
    expect(q.url).toContain("https://quickbooks.api.intuit.com/v3/company/123456");
  });

  it("create-invoice requires --writes and no network calls otherwise", async () => {
    calls.length = 0;
    await expect(quickbooksAdapter(contract("quickbooks-create-invoice"), ctx({ allowWrites: false }))).rejects.toThrow(/write verification disabled/);
    expect(calls).toHaveLength(0);
  });

  it("create-invoice posts a labeled Phase7 invoice with a real customer + account", async () => {
    const r = await quickbooksAdapter(contract("quickbooks-create-invoice"), ctx());
    expect(r.httpStatus).toBe(201);
    expect((r.response as any).created).toBe(true);
    expect((r.response as any).invoiceId).toBe("inv-new");
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/invoice"))!;
    expect(post.body.CustomerRef.value).toBe("cust-0"); // real customer reused
    expect(post.body.Line[0].Amount).toBe(1.0);
  });

  it("create-customer posts a labeled Phase7 customer", async () => {
    const r = await quickbooksAdapter(contract("quickbooks-create-customer"), ctx());
    expect(r.httpStatus).toBe(201);
    expect((r.response as any).customerId).toBe("cust-new");
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/customer"))!;
    expect(post.body.DisplayName).toMatch(/Phase7 Verification/);
  });

  it("fails closed with no companyId and no network calls", async () => {
    calls.length = 0;
    await expect(quickbooksAdapter(contract("quickbooks-read-invoices"), ctx({ credentials: { accessToken: "tok-1" } }))).rejects.toThrow(/no companyId/);
    expect(calls).toHaveLength(0);
  });

  it("fails closed with no access token", async () => {
    calls.length = 0;
    await expect(quickbooksAdapter(contract("quickbooks-read-invoices"), ctx({ credentials: { companyId: "123456" } }))).rejects.toThrow(/no accessToken/);
    expect(calls).toHaveLength(0);
  });

  it("unknown capability ids fail closed without network calls", async () => {
    calls.length = 0;
    await expect(quickbooksAdapter(contract("quickbooks-make-coffee"), ctx())).rejects.toThrow(/no verification path/);
    expect(calls).toHaveLength(0);
  });

  it("monitor contracts fail closed (need a real Intuit webhook receipt)", async () => {
    calls.length = 0;
    await expect(quickbooksAdapter(contract("quickbooks-monitor-invoice-created"), ctx())).rejects.toThrow(/live Intuit webhook receipt/);
    await expect(quickbooksAdapter(contract("quickbooks-monitor-customer-created"), ctx())).rejects.toThrow(/live Intuit webhook receipt/);
    expect(calls).toHaveLength(0);
  });
});
