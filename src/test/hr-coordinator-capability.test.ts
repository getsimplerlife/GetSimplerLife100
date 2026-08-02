import { describe, expect, it } from "vitest";
import { hrCoordinatorCapabilities, readEmployees, updateEmployee } from "../agents/capabilities/hr-coordinator";
describe("HR Coordinator / Workday capability slice", () => {
 it("keeps contracts unverified", () => expect(hrCoordinatorCapabilities.every((c) => c.status === "unverified")).toBe(true));
 it("fails closed without tenant or auth", async () => { const a = { listEmployees: async () => [] } as any; await expect(readEmployees(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope"); await expect(readEmployees(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async () => { let calls=0; const out:string[]=[]; const r=await readEmployees({ listEmployees: async t => { calls++; expect(t).toBe("t"); if(calls<2) throw Error("temporary"); return ["employee"]; } }, { tenantId:"t", authToken:"token", maxAttempts:2, audit:e=>out.push(e.outcome) }); expect(r).toEqual(["employee"]); expect(calls).toBe(2); expect(out).toEqual(["succeeded"]); });
 it("requires idempotency and audits failed writes", async () => { const out:string[]=[]; const a={updateEmployee:async()=>{throw Error("unavailable")}}; await expect(updateEmployee(a, {}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)}, "")).rejects.toThrow("Idempotency"); await expect(updateEmployee(a, {}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)}, "k")).rejects.toThrow("unavailable"); expect(out).toEqual(["failed"]); });
});
