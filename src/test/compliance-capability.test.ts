import { describe, expect, it } from "vitest";
import { complianceCapabilities, readAuditItems, createAuditFinding } from "../agents/capabilities/compliance";
describe("Compliance / Jira capability slice", () => {
 it("keeps contracts unverified", () => expect(complianceCapabilities.every((c) => c.status === "unverified")).toBe(true));
 it("fails closed without tenant or auth", async () => { const a = { listAuditItems: async () => [] } as any; await expect(readAuditItems(a, { tenantId: "", authToken: "x", audit: () => {} })).rejects.toThrow("Tenant scope"); await expect(readAuditItems(a, { tenantId: "t", audit: () => {} })).rejects.toThrow("authentication"); });
 it("retries bounded reads and audits", async () => { let calls=0; const out:string[]=[]; const r=await readAuditItems({ listAuditItems: async t => { calls++; expect(t).toBe("t"); if(calls<2) throw Error("temporary"); return ["finding"]; } }, { tenantId:"t", authToken:"token", maxAttempts:2, audit:e=>out.push(e.outcome) }); expect(r).toEqual(["finding"]); expect(calls).toBe(2); expect(out).toEqual(["succeeded"]); });
 it("requires idempotency and audits failed writes", async () => { const out:string[]=[]; const a={createAuditFinding:async()=>{throw Error("unavailable")}}; await expect(createAuditFinding(a, {}, {tenantId:"t",authToken:"token",audit:e=>out.push(e.outcome)}, "")).rejects.toThrow("Idempotency"); await expect(createAuditFinding(a, {}, {tenantId:"t",authToken:"token",maxAttempts:2,audit:e=>out.push(e.outcome)}, "k")).rejects.toThrow("unavailable"); expect(out).toEqual(["failed"]); });
});

describe("Compliance / Jira extended executors", () => {
  const opts = { tenantId: "t", authToken: "token", maxAttempts: 2, audit: () => {} };
  it("covers the 10-contract matrix with fail-closed contracts", () => {
    const ids = complianceCapabilities.map((c) => c.capabilityId);
    for (const id of ["jira-read-audit-items","jira-create-audit-finding","jira-read-projects","jira-link-issues","jira-read-comments","jira-transition-issue","jira-monitor-issue-created","jira-read-issue","jira-update-issue","jira-read-sprints"]) {
      expect(ids).toContain(id);
    }
    expect(complianceCapabilities.length).toBe(10);
  });
  it("runs extended reads with audit", async () => {
    const { readProjects, readComments, readIssue, readSprints } = await import("../agents/capabilities/compliance");
    const adapter = {
      readProjects: async () => ["PROJ"],
      readComments: async () => ["comment"],
      read: async (id: string) => (id === "jira-read-issue" ? { key: "X-1" } : ["sprint"]),
    };
    expect(await readProjects(adapter as any, opts as any)).toEqual(["PROJ"]);
    expect(await readComments(adapter as any, opts as any)).toEqual(["comment"]);
    expect(await readIssue(adapter as any, opts as any)).toEqual({ key: "X-1" });
    expect(await readSprints(adapter as any, opts as any)).toEqual(["sprint"]);
  });
  it("requires idempotency keys for extended writes", async () => {
    const { linkIssues, transitionIssue, updateIssue } = await import("../agents/capabilities/compliance");
    const adapter = { linkIssues: async () => ({}), transitionIssue: async () => ({}), write: async () => ({}) };
    await expect(linkIssues(adapter as any, opts as any, {}, "")).rejects.toThrow("Idempotency");
    await expect(transitionIssue(adapter as any, opts as any, {}, "")).rejects.toThrow("Idempotency");
    await expect(updateIssue(adapter as any, opts as any, {}, "")).rejects.toThrow("Idempotency");
  });
  it("fails closed when the monitor adapter method is unavailable", async () => {
    const { monitorIssueCreated } = await import("../agents/capabilities/compliance");
    await expect(monitorIssueCreated({} as any, opts as any, {})).rejects.toThrow("unavailable");
  });
});
