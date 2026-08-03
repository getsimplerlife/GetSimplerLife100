import { describe, expect, it } from "vitest";
import {
  customerSupportCapabilities,
  readTickets,
  replyToTicket,
  readTicketFields,
  updateTicketStatus,
  readKnowledgeBase,
  monitorTicketCreated,
} from "../agents/capabilities/customer-support";

describe("Customer Support / Zendesk capability slice", () => {
  it("keeps contracts unverified", () =>
    expect(customerSupportCapabilities.every((c) => c.status === "unverified")).toBe(true));

  it("exposes the full 6-contract matrix (3 understand, 2 automate, 1 monitor)", () => {
    const ids = customerSupportCapabilities.map((c) => c.capabilityId);
    expect(ids).toEqual([
      "zendesk-read-tickets",
      "zendesk-reply-ticket",
      "zendesk-read-ticket-fields",
      "zendesk-update-ticket-status",
      "zendesk-read-knowledge-base",
      "zendesk-monitor-ticket-created",
    ]);
    const kinds = customerSupportCapabilities.map((c) => c.kind);
    expect(kinds.filter((k) => k === "understand")).toHaveLength(3);
    expect(kinds.filter((k) => k === "automate")).toHaveLength(2);
    expect(kinds.filter((k) => k === "monitor")).toHaveLength(1);
    for (const c of customerSupportCapabilities) {
      expect(c.providerId).toBe("zendesk");
      expect(c.tenantScoped).toBe(true);
      expect(c.authRequired).toBe(true);
      expect(c.auditRequired).toBe(true);
    }
  });

  it("fails closed without tenant or auth", async () => {
    const a = { listTickets: async () => [] } as any;
    await expect(readTickets(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readTickets(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });

  it("retries bounded reads and audits", async () => {
    let calls = 0;
    const out: string[] = [];
    const r = await readTickets(
      {
        listTickets: async (t) => {
          calls++;
          expect(t).toBe("t");
          if (calls < 2) throw Error("temporary");
          return ["ticket"];
        },
      },
      { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) },
    );
    expect(r).toEqual(["ticket"]);
    expect(calls).toBe(2);
    expect(out).toEqual(["succeeded"]);
  });

  it("requires idempotency and audits failed writes", async () => {
    const out: string[] = [];
    const a = { replyTicket: async () => { throw Error("unavailable"); } };
    await expect(replyToTicket(a, {}, { tenantId: "t", authToken: "token", audit: (e) => out.push(e.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(replyToTicket(a, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(out).toEqual(["failed"]);
  });

  it("runs extended reads through the adapter and audits success", async () => {
    const out: string[] = [];
    const adapter = {
      readTicketFields: async (tenant: string) => ({ tenant, fields: ["subject", "status"] }),
      readKnowledgeBase: async (tenant: string) => ({ tenant, articles: 3 }),
    } as any;
    const opts = { tenantId: "t", authToken: "token", audit: (e: any) => out.push(e.capabilityId + ":" + e.outcome) };
    const fields = await readTicketFields(adapter, opts);
    const kb = await readKnowledgeBase(adapter, opts);
    expect(fields).toEqual({ tenant: "t", fields: ["subject", "status"] });
    expect(kb).toEqual({ tenant: "t", articles: 3 });
    expect(out).toEqual(["zendesk-read-ticket-fields:succeeded", "zendesk-read-knowledge-base:succeeded"]);
  });

  it("fails closed when the adapter lacks a monitor method", async () => {
    const out: string[] = [];
    await expect(monitorTicketCreated({} as any, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) })).rejects.toThrow("Capability adapter method is unavailable");
    expect(out).toEqual([]);
  });

  it("monitors newly created tickets and audits success", async () => {
    const out: string[] = [];
    const adapter = { monitorTicketCreated: async (tenant: string) => ({ tenant, recent: 2 }) } as any;
    const result = await monitorTicketCreated(adapter, { tenantId: "t", authToken: "token", audit: (e) => out.push(e.outcome) });
    expect(result).toEqual({ tenant: "t", recent: 2 });
    expect(out).toEqual(["succeeded"]);
  });

  it("enforces tenant scope for monitors even when the adapter has the method", async () => {
    const adapter = { monitorTicketCreated: async () => ({ recent: 1 }) } as any;
    await expect(monitorTicketCreated(adapter, { tenantId: "", authToken: "token", audit: () => {} })).rejects.toThrow("Tenant scope");
  });

  it("requires idempotency and audits failed status updates", async () => {
    const out: string[] = [];
    const adapter = { updateTicketStatus: async () => { throw Error("unavailable"); } } as any;
    await expect(updateTicketStatus(adapter, { tenantId: "t", authToken: "token", audit: (e) => out.push(e.outcome) }, { status: "open" }, "")).rejects.toThrow("Idempotency");
    await expect(updateTicketStatus(adapter, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) }, { status: "open" }, "k")).rejects.toThrow("unavailable");
    expect(out).toEqual(["failed"]);
  });
});
