import { describe, expect, it } from "vitest";
import { communicationsCapabilities, readMessages, sendMessage } from "../agents/capabilities/communications";
describe("Communications / Slack capability slice", () => {
 it("keeps contracts unverified", () => expect(communicationsCapabilities.every((c) => c.status === "unverified")).toBe(true));
 it("fails closed without tenant or auth", async()=>{ const a={listMessages:async()=>[]} as any; await expect(readMessages(a,{tenantId:"",authToken:"x",audit:()=>{}})).rejects.toThrow("Tenant scope"); await expect(readMessages(a,{tenantId:"t",audit:()=>{}})).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async()=>{let calls=0;const out:string[]=[];const r=await readMessages({listMessages:async t=>{calls++;expect(t).toBe("t");if(calls<2)throw Error("temporary");return ["message"];}},{tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)});expect(r).toEqual(["message"]);expect(calls).toBe(2);expect(out).toEqual(["succeeded"]);});
 it("requires idempotency and audits failed writes", async()=>{const out:string[]=[];const a={sendMessage:async()=>{throw Error("unavailable")}};await expect(sendMessage(a,{}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)},"")).rejects.toThrow("Idempotency");await expect(sendMessage(a,{}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)},"k")).rejects.toThrow("unavailable");expect(out).toEqual(["failed"]);});
});
