import { beforeEach, describe, expect, it } from "vitest";
import { clearEvidence, getEvidence, isVerified, recordEvidence } from "../verification/registry";
import { runVerification } from "../verification/runner";
import type { CapabilityContract } from "../lib/capability-contract";

const contract: CapabilityContract = { employeeId: "test", capabilityId: "test-read", kind: "understand", status: "unverified", providerId: "provider", tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "pending" };

describe("provider verification evidence", () => {
  beforeEach(() => clearEvidence());
  it("records and retrieves evidence", () => { const result = { capabilityId: "test-read", status: "verified" as const, evidence: { capabilityId: "test-read", providerId: "provider", timestamp: new Date().toISOString(), httpStatus: 200, responseShape: "object", verifiedBy: "test" }, expiresAt: new Date(Date.now() + 1000).toISOString() }; recordEvidence(result); expect(getEvidence("test-read")).toEqual(result); expect(isVerified("test-read")).toBe(true); });
  it("marks verified and failed correctly", async () => { const verified = await runVerification(contract, async () => ({ httpStatus: 200, response: { reports: [] } }), { token: "secret" }); expect(verified.status).toBe("verified"); const failed = await runVerification(contract, async () => { throw new Error("provider unavailable"); }, { token: "secret" }); expect(failed.status).toBe("failed"); expect(failed.evidence.errorMessage).toContain("provider unavailable"); });
  it("handles missing credentials gracefully", async () => { const result = await runVerification(contract, async () => ({ httpStatus: 200 }), undefined); expect(result.status).toBe("failed"); expect(result.evidence.errorMessage).toContain("credentials"); });
  it("handles timeout", async () => { const result = await runVerification(contract, async () => new Promise(() => {}), { token: "secret" }, { timeoutMs: 5 }); expect(result.status).toBe("failed"); expect(result.evidence.errorMessage).toContain("timed out"); });
});
