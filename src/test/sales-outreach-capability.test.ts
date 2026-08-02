import { describe, expect, it } from "vitest";
import { createDeal, readContacts, salesOutreachCapabilities } from "../agents/capabilities/sales-outreach";
describe("Sales Outreach / HubSpot capability slice", () => {
 it("keeps contracts unverified", () => expect(salesOutreachCapabilities.every((c) => c.status === "unverified")).toBe(true));
 it("fails closed without tenant or auth", async () => { const a = { listContacts: async () => [] } as any; await expect(readContacts(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope"); await expect(readContacts(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async () => { let calls=0; const out:string[]=[]; const r=await readContacts({ listContacts: async t => { calls++; expect(t).toBe("t"); if(calls<2) throw Error("temporary"); return ["c"]; } }, { tenantId:"t", authToken:"token", maxAttempts:2, audit:e=>out.push(e.outcome) }); expect(r).toEqual(["c"]); expect(calls).toBe(2); expect(out).toEqual(["succeeded"]); });
 it("requires idempotency and audits failed writes", async () => { const out:string[]=[]; const a={createDeal:async()=>{throw Error("unavailable")}}; await expect(createDeal(a, {}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)}, "")).rejects.toThrow("Idempotency"); await expect(createDeal(a, {}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)}, "k")).rejects.toThrow("unavailable"); expect(out).toEqual(["failed"]); });
});
