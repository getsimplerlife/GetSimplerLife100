import { describe, expect, it } from "vitest";
import { manufacturingCapabilities, readOrders, createProduct } from "../agents/capabilities/manufacturing";
describe("Manufacturing / Shopify capability slice", () => {
 it("keeps contracts unverified", () => expect(manufacturingCapabilities.map(c=>c.status)).toEqual(["unverified","unverified"]));
 it("fails closed without tenant or auth", async()=>{ const a={listOrders:async()=>[]} as any; await expect(readOrders(a,{tenantId:"",authToken:"x",audit:()=>{}})).rejects.toThrow("Tenant scope"); await expect(readOrders(a,{tenantId:"t",audit:()=>{}})).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async()=>{let calls=0;const out:string[]=[];const r=await readOrders({listOrders:async t=>{calls++;expect(t).toBe("t");if(calls<2)throw Error("temporary");return ["order"];}},{tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)});expect(r).toEqual(["order"]);expect(calls).toBe(2);expect(out).toEqual(["succeeded"]);});
 it("requires idempotency and audits failed writes", async()=>{const out:string[]=[];const a={createProduct:async()=>{throw Error("unavailable")}};await expect(createProduct(a,{}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)},"")).rejects.toThrow("Idempotency");await expect(createProduct(a,{}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)},"k")).rejects.toThrow("unavailable");expect(out).toEqual(["failed"]);});
});
