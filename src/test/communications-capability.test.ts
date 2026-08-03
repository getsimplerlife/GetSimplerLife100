import { describe, expect, it } from "vitest";
import { communicationsCapabilities, readMessages, sendMessage } from "../agents/capabilities/communications";
describe("Communications / Slack capability slice", () => {
 it("keeps contracts unverified", () => expect(communicationsCapabilities.every((c) => c.status === "unverified")).toBe(true));
 it("fails closed without tenant or auth", async()=>{ const a={listMessages:async()=>[]} as any; await expect(readMessages(a,{tenantId:"",authToken:"x",audit:()=>{}})).rejects.toThrow("Tenant scope"); await expect(readMessages(a,{tenantId:"t",audit:()=>{}})).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async()=>{let calls=0;const out:string[]=[];const r=await readMessages({listMessages:async t=>{calls++;expect(t).toBe("t");if(calls<2)throw Error("temporary");return ["message"];}},{tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)});expect(r).toEqual(["message"]);expect(calls).toBe(2);expect(out).toEqual(["succeeded"]);});
 it("requires idempotency and audits failed writes", async()=>{const out:string[]=[];const a={sendMessage:async()=>{throw Error("unavailable")}};await expect(sendMessage(a,{}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)},"")).rejects.toThrow("Idempotency");await expect(sendMessage(a,{}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)},"k")).rejects.toThrow("unavailable");expect(out).toEqual(["failed"]);});
});

describe("Communications / Slack extended executors", () => {
  const opts = { tenantId: "t", authToken: "token", maxAttempts: 2, audit: () => {} };
  it("covers the 12-contract matrix with fail-closed contracts", () => {
    const ids = communicationsCapabilities.map((c) => c.capabilityId);
    for (const id of ["slack-read-channels","slack-read-channel-history","slack-read-messages","slack-read-users","slack-read-user-info","slack-search-messages","slack-send-message","slack-send-ephemeral","slack-add-reaction","slack-upload-file","slack-monitor-mention","slack-monitor-channel-activity"]) {
      expect(ids).toContain(id);
    }
    expect(communicationsCapabilities.length).toBe(12);
  });
  it("runs extended reads with audit", async () => {
    const { readChannels, readUsers, searchMessages } = await import("../agents/capabilities/communications");
    const adapter = { readChannels: async () => ["general"], readUsers: async () => [{ id: "U1" }], searchMessages: async () => [] };
    expect(await readChannels(adapter as any, opts as any)).toEqual(["general"]);
    expect(await readUsers(adapter as any, opts as any)).toHaveLength(1);
    expect(await searchMessages(adapter as any, opts as any)).toEqual([]);
  });
  it("requires idempotency keys for extended writes", async () => {
    const { uploadFile, addReaction, sendEphemeral } = await import("../agents/capabilities/communications");
    const adapter = { uploadFile: async () => ({ ok: true }), addReaction: async () => ({}), sendEphemeral: async () => ({ ok: true }) };
    await expect(uploadFile(adapter as any, opts as any, {}, "")).rejects.toThrow("Idempotency");
    await expect(addReaction(adapter as any, opts as any, {}, "")).rejects.toThrow("Idempotency");
    await expect(sendEphemeral(adapter as any, opts as any, {}, "")).rejects.toThrow("Idempotency");
  });
  it("fails closed when the monitor adapter method is unavailable", async () => {
    const { monitorMention, monitorChannelActivity } = await import("../agents/capabilities/communications");
    await expect(monitorMention({} as any, opts as any, {})).rejects.toThrow("unavailable");
    await expect(monitorChannelActivity({} as any, opts as any, {})).rejects.toThrow("unavailable");
  });
});
