import { describe, expect, it } from "vitest";
import { procurementCapabilities, readPurchaseOrders, createPurchaseOrder } from "../agents/capabilities/procurement";
describe("Procurement / Coupa capability slice", () => {
 it("keeps contracts unverified", () => expect(procurementCapabilities.map(c=>c.status)).toEqual(["unverified","unverified"]));
 it("fails closed without tenant or auth", async()=>{ const a={listPurchaseOrders:async()=>[]} as any; await expect(readPurchaseOrders(a,{tenantId:"",authToken:"x",audit:()=>{}})).rejects.toThrow("Tenant scope"); await expect(readPurchaseOrders(a,{tenantId:"t",audit:()=>{}})).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async()=>{let calls=0;const out:string[]=[];const r=await readPurchaseOrders({listPurchaseOrders:async t=>{calls++;expect(t).toBe("t");if(calls<2)throw Error("temporary");return ["po"];}},{tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)});expect(r).toEqual(["po"]);expect(calls).toBe(2);expect(out).toEqual(["succeeded"]);});
 it("requires idempotency and audits failed writes", async()=>{const out:string[]=[];const a={createPurchaseOrder:async()=>{throw Error("unavailable")}};await expect(createPurchaseOrder(a,{}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)},"")).rejects.toThrow("Idempotency");await expect(createPurchaseOrder(a,{}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)},"k")).rejects.toThrow("unavailable");expect(out).toEqual(["failed"]);});
});
