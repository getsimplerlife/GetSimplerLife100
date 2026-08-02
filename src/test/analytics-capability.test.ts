import { describe, expect, it } from "vitest";
import { analyticsCapabilities, readReports } from "../agents/capabilities/analytics";
describe("Analytics / Tableau capability slice", () => {
  it("keeps contracts unverified", () => expect(analyticsCapabilities.map((c) => c.status)).toEqual(["unverified"]));
  it("fails closed without tenant or auth", async () => { const adapter = { listReports: async () => [] } as any; await expect(readReports(adapter, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope"); await expect(readReports(adapter, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication"); });
  it("retries bounded reads and audits", async () => { let calls = 0; const outcomes: string[] = []; const result = await readReports({ listReports: async (tenantId) => { calls++; expect(tenantId).toBe("t"); if (calls < 2) throw Error("temporary"); return ["report"]; } }, { tenantId: "t", authToken: "token", maxAttempts: 2, audit: (event) => outcomes.push(event.outcome) }); expect(result).toEqual(["report"]); expect(calls).toBe(2); expect(outcomes).toEqual(["succeeded"]); });
});
