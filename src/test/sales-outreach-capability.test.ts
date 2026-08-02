import { describe, expect, it } from "vitest";
import {
  createCompany,
  createContact,
  createDeal,
  readCompanies,
  readContacts,
  readDeals,
  readOwners,
  readPipelineStages,
  readTickets,
  salesOutreachCapabilities,
  updateDealStage,
} from "../agents/capabilities/sales-outreach";

const UNVERIFIED = "unverified";

describe("Sales Outreach / HubSpot capability slice", () => {
  it("exposes 11 contracts with the expected kind split and all unverified", () => {
    expect(salesOutreachCapabilities).toHaveLength(11);
    expect(salesOutreachCapabilities.filter((c) => c.kind === "understand")).toHaveLength(6);
    expect(salesOutreachCapabilities.filter((c) => c.kind === "automate")).toHaveLength(4);
    expect(salesOutreachCapabilities.filter((c) => c.kind === "monitor")).toHaveLength(1);
    expect(salesOutreachCapabilities.map((c) => c.status)).toEqual(Array(11).fill(UNVERIFIED));
  });

  it("keeps every contract tenant-scoped, auth-required, audited, and bounded", () => {
    for (const c of salesOutreachCapabilities) {
      expect(c.tenantScoped).toBe(true);
      expect(c.authRequired).toBe(true);
      expect(c.auditRequired).toBe(true);
      expect(c.retryPolicy).toBe("bounded");
      expect(c.providerId).toBe("hubspot");
      if (c.kind === "automate") {
        expect(c.idempotencyRequired).toBe(true);
        expect(c.rollback).not.toBe("not_applicable");
      }
    }
  });

  it("fails closed without tenant or auth", async () => {
    const a = { listContacts: async () => [] } as any;
    await expect(readContacts(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readContacts(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("retries bounded reads and audits", async () => {
    let calls = 0;
    const out: string[] = [];
    const r = await readContacts(
      {
        listContacts: async (t) => {
          calls++;
          expect(t).toBe("t");
          if (calls < 2) throw Error("temporary");
          return ["c"];
        },
      },
      { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) },
    );
    expect(r).toEqual(["c"]);
    expect(calls).toBe(2);
    expect(out).toEqual(["succeeded"]);
  });

  it("audits a failed read and throws the last error", async () => {
    const out: string[] = [];
    const a = { listCompanies: async () => { throw Error("down"); } } as any;
    await expect(readCompanies(a, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) })).rejects.toThrow("down");
    expect(out).toEqual(["failed"]);
  });

  it("requires idempotency and audits failed writes", async () => {
    const out: string[] = [];
    const a = { createDeal: async () => { throw Error("unavailable"); } } as any;
    await expect(createDeal(a, {}, { tenantId: "t", authToken: "token", audit: (e) => out.push(e.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(createDeal(a, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(out).toEqual(["failed"]);
  });

  it("runs the other read executors with audit + retry", async () => {
    const mk = (list: string) => ({ [list]: async (t: string) => `ok:${t}` } as any);
    expect(await readDeals(mk("listDeals"), { tenantId: "t", authToken: "x", audit: () => {} })).toBe("ok:t");
    expect(await readTickets(mk("listTickets"), { tenantId: "t", authToken: "x", audit: () => {} })).toBe("ok:t");
    expect(await readPipelineStages(mk("listPipelineStages"), { tenantId: "t", authToken: "x", audit: () => {} })).toBe("ok:t");
    expect(await readOwners(mk("listOwners"), { tenantId: "t", authToken: "x", audit: () => {} })).toBe("ok:t");
  });

  it("runs the other write executors with idempotency keys", async () => {
    const a = {
      createContact: async (_t: string, _i: unknown, key: string) => `c:${key}`,
      createCompany: async (_t: string, _i: unknown, key: string) => `co:${key}`,
      updateDealStage: async (_t: string, _i: unknown, key: string) => `d:${key}`,
    } as any;
    expect(await createContact(a, {}, { tenantId: "t", authToken: "x", audit: () => {} }, "k1")).toBe("c:k1");
    expect(await createCompany(a, {}, { tenantId: "t", authToken: "x", audit: () => {} }, "k2")).toBe("co:k2");
    expect(await updateDealStage(a, {}, { tenantId: "t", authToken: "x", audit: () => {} }, "k3")).toBe("d:k3");
  });
});
