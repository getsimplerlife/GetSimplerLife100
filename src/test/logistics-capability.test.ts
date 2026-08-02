import { describe, expect, it } from "vitest";
import { logisticsCapabilities, readTasks, createTask } from "../agents/capabilities/logistics";
describe("Logistics / Onfleet capability slice", () => {
 it("keeps contracts unverified", () => expect(logisticsCapabilities.map(c=>c.status)).toEqual(["unverified","unverified"]));
 it("fails closed without tenant or auth", async()=>{ const a={listTasks:async()=>[]} as any; await expect(readTasks(a,{tenantId:"",authToken:"x",audit:()=>{}})).rejects.toThrow("Tenant scope"); await expect(readTasks(a,{tenantId:"t",audit:()=>{}})).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async()=>{let calls=0;const out:string[]=[];const r=await readTasks({listTasks:async t=>{calls++;expect(t).toBe("t");if(calls<2)throw Error("temporary");return ["task"];}},{tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)});expect(r).toEqual(["task"]);expect(calls).toBe(2);expect(out).toEqual(["succeeded"]);});
 it("requires idempotency and audits failed writes", async()=>{const out:string[]=[];const a={createTask:async()=>{throw Error("unavailable")}};await expect(createTask(a,{}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)},"")).rejects.toThrow("Idempotency");await expect(createTask(a,{}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)},"k")).rejects.toThrow("unavailable");expect(out).toEqual(["failed"]);});
});
