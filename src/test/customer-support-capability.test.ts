import { describe, expect, it } from "vitest";
import { customerSupportCapabilities, readTickets, replyToTicket } from "../agents/capabilities/customer-support";
describe("Customer Support / Zendesk capability slice", () => {
 it("keeps contracts unverified", () => expect(customerSupportCapabilities.map(c => c.status)).toEqual(["unverified", "unverified"]));
 it("fails closed without tenant or auth", async () => { const a = { listTickets: async () => [] } as any; await expect(readTickets(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope"); await expect(readTickets(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async () => { let calls=0; const out:string[]=[]; const r=await readTickets({ listTickets: async t => { calls++; expect(t).toBe("t"); if(calls<2) throw Error("temporary"); return ["ticket"]; } }, { tenantId:"t", authToken:"token", maxAttempts:2, audit:e=>out.push(e.outcome) }); expect(r).toEqual(["ticket"]); expect(calls).toBe(2); expect(out).toEqual(["succeeded"]); });
 it("requires idempotency and audits failed writes", async () => { const out:string[]=[]; const a={replyTicket:async()=>{throw Error("unavailable")}}; await expect(replyToTicket(a, {}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)}, "")).rejects.toThrow("Idempotency"); await expect(replyToTicket(a, {}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)}, "k")).rejects.toThrow("unavailable"); expect(out).toEqual(["failed"]); });
});
