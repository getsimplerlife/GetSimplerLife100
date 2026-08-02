import { describe, expect, it } from "vitest";
import { defineCapabilityContract } from "../lib/capability-contract";

describe("capability contract foundation", () => {
  it("defaults absent evidence status to unverified", () => {
    const c = defineCapabilityContract({ employeeId: "po-management-agent-v1", capabilityId: "read-po", kind: "understand", tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "none", rollback: "not_applicable", evidence: "fixture-only" });
    expect(c.status).toBe("unverified");
  });
  it("rejects unsafe automate contracts", () => {
    expect(() => defineCapabilityContract({ employeeId: "x", capabilityId: "write", kind: "automate", tenantScoped: true, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "none", rollback: "not_applicable", evidence: "none" })).toThrow("Automate capability requires");
  });
  it("requires monitoring scope and audit controls", () => {
    expect(() => defineCapabilityContract({ employeeId: "x", capabilityId: "events", kind: "monitor", tenantScoped: false, authRequired: true, auditRequired: true, idempotencyRequired: false, retryPolicy: "bounded", rollback: "not_applicable", evidence: "fixture" })).toThrow("Monitor capability requires");
  });
});
