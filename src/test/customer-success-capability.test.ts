import { describe, expect, it } from "vitest";
import { customerSuccessCapabilities, readConversations, sendMessage } from "../agents/capabilities/customer-success";
describe("Customer Success / Intercom capability slice", () => {
 it("keeps contracts unverified", () => expect(customerSuccessCapabilities.map(c=>c.status)).toEqual(["unverified","unverified"]));
 it("fails closed without tenant or auth", async()=>{ const a={listConversations:async()=>[]} as any; await expect(readConversations(a,{tenantId:"",authToken:"x",audit:()=>{}})).rejects.toThrow("Tenant scope"); await expect(readConversations(a,{tenantId:"t",audit:()=>{}})).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async()=>{let calls=0;const out:string[]=[];const r=await readConversations({listConversations:async t=>{calls++;expect(t).toBe("t");if(calls<2)throw Error("temporary");return ["conversation"];}},{tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)});expect(r).toEqual(["conversation"]);expect(calls).toBe(2);expect(out).toEqual(["succeeded"]);});
 it("requires idempotency and audits failed writes", async()=>{const out:string[]=[];const a={sendMessage:async()=>{throw Error("unavailable")}};await expect(sendMessage(a,{}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)},"")).rejects.toThrow("Idempotency");await expect(sendMessage(a,{}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)},"k")).rejects.toThrow("unavailable");expect(out).toEqual(["failed"]);});
});
