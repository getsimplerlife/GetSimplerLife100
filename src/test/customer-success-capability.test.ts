import { describe, expect, it } from "vitest";
import { customerSuccessCapabilities, readConversations, sendMessage, readContacts, readConversation, createContact, monitorConversations } from "../agents/capabilities/customer-success";

describe("Customer Success / Intercom capability slice", () => {
  it("has 10 unverified contracts", () => {
    expect(customerSuccessCapabilities).toHaveLength(10);
    expect(customerSuccessCapabilities.map((c) => c.status)).toEqual(Array(10).fill("unverified"));
  });
  it("has correct provider id", () => {
    expect(customerSuccessCapabilities.every((c) => c.providerId === "intercom")).toBe(true);
  });
  it("has correct capability ids", () => {
    const ids = customerSuccessCapabilities.map((c) => c.capabilityId).sort();
    expect(ids).toEqual([
      "intercom-assign-conversation",
      "intercom-create-contact",
      "intercom-monitor-conversations",
      "intercom-read-companies",
      "intercom-read-contact",
      "intercom-read-contacts",
      "intercom-read-conversation",
      "intercom-read-conversations",
      "intercom-send-message",
      "intercom-tag-user",
    ]);
  });
  it("has contract kinds: 5 understand, 4 automate, 1 monitor", () => {
    const kinds = customerSuccessCapabilities.reduce((acc, c) => { acc[c.kind] = (acc[c.kind] || 0) + 1; return acc; }, {} as Record<string, number>);
    expect(kinds.understand).toBe(5);
    expect(kinds.automate).toBe(4);
    expect(kinds.monitor).toBe(1);
  });
  it("fails closed without tenant or auth for readConversations", async () => {
    const a = { readConversations: async () => [] } as any;
    await expect(readConversations(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope");
    await expect(readConversations(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication");
  });
  it("retries bounded reads and audits for readConversations", async () => {
    let calls = 0; const out: string[] = [];
    const r = await readConversations({ readConversations: async (t) => { calls++; expect(t).toBe("t"); if (calls < 2) throw Error("temporary"); return ["conversation"]; } }, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) });
    expect(r).toEqual(["conversation"]); expect(calls).toBe(2); expect(out).toEqual(["succeeded"]);
  });
  it("requires idempotency and audits failed writes for sendMessage", async () => {
    const out: string[] = []; const a = { sendMessage: async () => { throw Error("unavailable"); } };
    await expect(sendMessage(a, {}, { tenantId: "t", authToken: "token", audit: (e) => out.push(e.outcome) }, "")).rejects.toThrow("Idempotency");
    await expect(sendMessage(a, {}, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (e) => out.push(e.outcome) }, "k")).rejects.toThrow("unavailable");
    expect(out).toEqual(["failed"]);
  });
  it("readContacts succeeds with valid adapter", async () => {
    const r = await readContacts({ readContacts: async () => ["c1", "c2"] }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(r).toEqual(["c1", "c2"]);
  });
  it("readConversation succeeds with valid adapter", async () => {
    const r = await readConversation({ readConversation: async () => ({ id: "conv1", source: "chat" }) }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(r).toEqual({ id: "conv1", source: "chat" });
  });
  it("createContact requires idempotency and succeeds", async () => {
    const adapter = { createContact: async () => ({ id: "c1" }) };
    await expect(createContact(adapter, { email: "test@test.com" }, { tenantId: "t", authToken: "token", audit: () => {} }, "")).rejects.toThrow("Idempotency");
    const r = await createContact(adapter, { email: "test@test.com" }, { tenantId: "t", authToken: "token", audit: () => {} }, "ik1");
    expect(r).toEqual({ id: "c1" });
  });
  it("monitorConversations succeeds with valid adapter", async () => {
    const r = await monitorConversations({ monitorConversations: async () => ({ recent: 3 }) }, { tenantId: "t", authToken: "token", audit: () => {} });
    expect(r).toEqual({ recent: 3 });
  });
});
