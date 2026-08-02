import { describe, expect, it } from "vitest";
import { complianceCapabilities, readAuditItems, createAuditFinding } from "../agents/capabilities/compliance";
describe("Compliance / Jira capability slice", () => {
 it("keeps contracts unverified", () => expect(complianceCapabilities.map(c => c.status)).toEqual(["unverified", "unverified"]));
 it("fails closed without tenant or auth", async () => { const a = { listAuditItems: async () => [] } as any; await expect(readAuditItems(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope"); await expect(readAuditItems(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async () => { let calls=0; const out:string[]=[]; const r=await readAuditItems({ listAuditItems: async t => { calls++; expect(t).toBe("t"); if(calls<2) throw Error("temporary"); return ["finding"]; } }, { tenantId:"t", authToken:"token", maxAttempts:2, audit:e=>out.push(e.outcome) }); expect(r).toEqual(["finding"]); expect(calls).toBe(2); expect(out).toEqual(["succeeded"]); });
 it("requires idempotency and audits failed writes", async () => { const out:string[]=[]; const a={createAuditFinding:async()=>{throw Error("unavailable")}}; await expect(createAuditFinding(a, {}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)}, "")).rejects.toThrow("Idempotency"); await expect(createAuditFinding(a, {}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)}, "k")).rejects.toThrow("unavailable"); expect(out).toEqual(["failed"]); });
});
