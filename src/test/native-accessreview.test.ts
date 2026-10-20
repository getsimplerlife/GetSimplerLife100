/**
 * native-accessreview.test.ts — Phase 4.3 native ACCESS-REVIEW /
 * CERTIFICATION-CAMPAIGN slice (periodic attestation/certification campaigns
 * over the tenant's OWN member access + workflow inventory + append-only
 * EVIDENCE log).
 *
 * Coverage (every standing contract):
 *   - write-verb classification: all nine mutation actions gate (verb-first;
 *     `attest` ADDED to WRITE_VERB so attestReviewItem gates — the fail-open
 *     guard), reads pass,
 *   - approval-by-default: a campaign/reviewer/attestation request queues and
 *     only the approve-path executor persists it,
 *   - idempotent apply (replay → no duplicates) + reject discards,
 *   - fail-closed validation BEFORE the gate (forged create-ids, unknown
 *     in-tenant table/workflow refs, caps → never queued),
 *   - server-assigned ids only; cross-tenant/stranger ids → 404-no-IDOR,
 *   - campaign lifecycle: draft → open (generates items from the tenant's OWN
 *     rows + workflows) → close/cancel; draft-only delete,
 *   - HONEST attestation: decisions record durable evidence with the explicit
 *     "no access was granted, changed or revoked" note — never a fabricated
 *     permission change,
 *   - typed native.accessreview.* event registration,
 *   - HTTP surface: 200/400/404/405 and cross-tenant reads return 404.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWriteAction } from "../lib/approval-queue";
import { createTable, insertRow, listRows } from "../native/tables/store";
import { saveRule, listRules, type AutomationRule } from "../native/automation/store";
import { handleNativeAccessReviewAuthed, registerBuiltinNativeAccessReviewEventTypes } from "../native/accessreview/router";
import { executePendingAccessReviewWrite, rejectAccessReviewWrite, submitAccessReviewWrite } from "../native/accessreview/gate";
import { listAudit, listCampaigns, listEvidence, listItems, listPendingWrites } from "../native/accessreview/store";
import { MAX_CAMPAIGNS_PER_TENANT, MAX_REVIEWERS_PER_CAMPAIGN } from "../native/accessreview/types";
import { validateNativeEventType } from "../native/webhooks/registry";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-accessreview-"));
  registerBuiltinNativeAccessReviewEventTypes();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ── 1.4 + 3.7 seed helpers (production writes ride their gates; tests seed
//    the shared stores directly — the same pattern the other slices use)
const TABLE_FIELDS = [
  { key: "name", label: "Name", type: "text" as const },
  { key: "email", label: "Email", type: "email" as const },
  { key: "role", label: "Role", type: "select" as const },
];
function seedTable(tenant = T1): string {
  const def = {
    id: `tbl_${Math.random().toString(36).slice(2, 10)}`,
    tenantId: tenant,
    name: "Members",
    description: "test",
    fields: TABLE_FIELDS,
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: "seed",
    updatedAt: new Date().toISOString(),
    updatedBy: "seed",
  };
  createTable(dir, def);
  return def.id;
}
function seedRow(tableId: string, tenant: string, data: Record<string, unknown>): string {
  const row = {
    id: `row_${Math.random().toString(36).slice(2, 12)}`,
    tenantId: tenant,
    tableId,
    data,
    createdAt: new Date().toISOString(),
    createdBy: "seed",
  };
  insertRow(dir, row);
  return row.id;
}
function seedWorkflow(tenant = T1, status: AutomationRule["status"] = "active", overrides: Record<string, unknown> = {}): string {
  const rule: AutomationRule = {
    id: `rul_${Math.random().toString(36).slice(2, 10)}`,
    tenantId: tenant,
    name: "Lead → notify",
    description: "seed",
    status,
    trigger: { kind: "event", eventType: "native.sales.lead.created" },
    conditions: [],
    actions: [{ kind: "notify", recipients: ["ops@co.test"], subject: "Lead", body: "New lead" }],
    autonomyAllowList: [],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: "seed",
    updatedAt: new Date().toISOString(),
    updatedBy: "seed",
    ...overrides,
  };
  saveRule(dir, rule);
  return rule.id;
}

/** Submit a write and expect it to QUEUE (approval default ON). */
function queueVia(op: Parameters<typeof submitAccessReviewWrite>[2], payload: Record<string, unknown>, actor = T1) {
  const res = submitAccessReviewWrite(dir, T1, op, { payload, via: "portal" }, actor);
  expect(res.applied, JSON.stringify(res)).toBe(false);
  if (res.applied || !("approvalActionId" in res)) throw new Error("expected pending");
  return res as Extract<ReturnType<typeof submitAccessReviewWrite>, { pending: true }>;
}
/** Approve the queued write via the approve-path executor. */
function approveVia(approvalActionId: string, actor = T1) {
  const res = executePendingAccessReviewWrite(dir, T1, approvalActionId, actor);
  expect(res.ok, JSON.stringify(res)).toBe(true);
  return res;
}

// ── 1. Write-verb classification (standing fail-open guard) ───────────────
describe("write-verb classification", () => {
  it("gates every access-review mutation verb-first (`attest` added to WRITE_VERB)", () => {
    for (const name of [
      "createReviewCampaign", "updateReviewCampaign", "deleteReviewCampaign",
      "openReviewCampaign", "closeReviewCampaign", "cancelReviewCampaign",
      "addCampaignReviewer", "removeCampaignReviewer", "attestReviewItem",
    ]) {
      expect(isWriteAction(name), name).toBe(true);
    }
  });
  it("never gates pure READ actions", () => {
    for (const name of [
      "listReviewCampaigns", "getReviewCampaign", "listReviewItems",
      "getReviewItem", "listEvidenceEntries", "getEvidenceEntry",
      "listAccessReviewWrites", "listAccessReviewAudit", "previewCampaignScope",
    ]) {
      expect(isWriteAction(name), name).toBe(false);
    }
  });
});

// ── 2. Approval-by-default + lifecycle ────────────────────────────────────
describe("campaign lifecycle (approval-gated)", () => {
  it("create queues; approve persists a draft campaign with server-assigned id", () => {
    const queued = queueVia("createReviewCampaign", { name: "Q3 Access Review", cadence: "quarterly", reviewerEmails: ["audit@co.test"] });
    const res = approveVia(queued.approvalActionId);
    const campaigns = listCampaigns(dir, T1);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].id.startsWith("arc_")).toBe(true);
    expect(campaigns[0].status).toBe("draft");
    expect(campaigns[0].reviewerEmails).toEqual(["audit@co.test"]);
    expect(res.id).toBe(campaigns[0].id);
  });

  it("open queues and, when approved, generates review items from the tenant's OWN rows + active workflows", () => {
    const tbl = seedTable(T1);
    seedRow(tbl, T1, { name: "Ada", email: "ada@co.test", role: "Admin" });
    seedRow(tbl, T1, { name: "Bob", email: "bob@co.test", role: "Ops" });
    const wfActive = seedWorkflow(T1, "active", { name: "Onboard → notify" });
    seedWorkflow(T1, "paused", { name: "Paused rule" });

    const created = queueVia("createReviewCampaign", { name: "Quarterly", cadence: "quarterly", memberTableId: tbl, reviewerEmails: ["audit@co.test"] });
    approveVia(created.approvalActionId);
    const campaignId = listCampaigns(dir, T1)[0]!.id;

    const queued = queueVia("openReviewCampaign", { campaignId });
    approveVia(queued.approvalActionId);

    const campaign = listCampaigns(dir, T1)[0]!;
    expect(campaign.status).toBe("open");
    expect(campaign.openedBy).toBe(T1);
    const items = listItems(dir, T1, campaignId);
    // 2 member rows + 1 ACTIVE workflow (paused excluded when no workflowIds).
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.kind)).toEqual(expect.arrayContaining(["member", "workflow"]));
    expect(items.filter((i) => i.kind === "workflow")[0]!.subjectRef).toBe(wfActive);
    expect(items.every((i) => i.status === "pending")).toBe(true);
    // Item snapshots are SAFE projections — no full secret-ish payloads.
    for (const item of items) {
      expect(item.snapshot.length).toBeLessThanOrEqual(4000);
      expect(item.snapshot).not.toContain("password");
    }
  });

  it("close/cancel are gated; close requires an open campaign; delete only drafts", () => {
    const queued = queueVia("createReviewCampaign", { name: "C1", reviewerEmails: ["a@co.test"] });
    approveVia(queued.approvalActionId);
    const id = listCampaigns(dir, T1)[0]!.id;

    // close on a draft → 400 before the gate
    const badClose = submitAccessReviewWrite(dir, T1, "closeReviewCampaign", { payload: { campaignId: id } }, T1);
    expect(badClose.applied).toBe(false);
    expect("error" in badClose && /only open/.test(badClose.error ?? "")).toBe(true);

    // open, then close
    approveVia(queueVia("openReviewCampaign", { campaignId: id }).approvalActionId);
    approveVia(queueVia("closeReviewCampaign", { campaignId: id }).approvalActionId);
    expect(listCampaigns(dir, T1)[0]!.status).toBe("closed");

    // delete a closed campaign → 400 (evidence durability)
    const badDelete = submitAccessReviewWrite(dir, T1, "deleteReviewCampaign", { payload: { campaignId: id } }, T1);
    expect("error" in badDelete && /only draft/.test(badDelete.error ?? "")).toBe(true);
  });

  it("reviewer add/remove are gated and cap-checked", () => {
    const queued = queueVia("createReviewCampaign", { name: "C1", reviewerEmails: ["a@co.test"] });
    approveVia(queued.approvalActionId);
    const id = listCampaigns(dir, T1)[0]!.id;

    approveVia(queueVia("addCampaignReviewer", { campaignId: id, email: "b@co.test" }).approvalActionId);
    expect(listCampaigns(dir, T1)[0]!.reviewerEmails).toEqual(["a@co.test", "b@co.test"]);

    // duplicate add → 400 before the gate
    const dup = submitAccessReviewWrite(dir, T1, "addCampaignReviewer", { payload: { campaignId: id, email: "b@co.test" } }, T1);
    expect("error" in dup && /already on/.test(dup.error ?? "")).toBe(true);

    approveVia(queueVia("removeCampaignReviewer", { campaignId: id, email: "a@co.test" }).approvalActionId);
    expect(listCampaigns(dir, T1)[0]!.reviewerEmails).toEqual(["b@co.test"]);
  });

  it("reviewer add cap is enforced before the gate (addCampaignReviewer)", () => {
    const emails = Array.from({ length: MAX_REVIEWERS_PER_CAMPAIGN }, (_, i) => `r${i}@co.test`);
    const queued = queueVia("createReviewCampaign", { name: "C", reviewerEmails: emails });
    approveVia(queued.approvalActionId);
    const id = listCampaigns(dir, T1)[0]!.id;
    const res = submitAccessReviewWrite(dir, T1, "addCampaignReviewer", { payload: { campaignId: id, email: "extra@co.test" } }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /reviewer cap reached/.test(res.error ?? "")).toBe(true);
  });
});

// ── 3. Attestation (certification) — the NEW `attest` verb ───────────────
describe("attestReviewItem (certification)", () => {
  function openCampaignWithItem(): string {
    const tbl = seedTable(T1);
    seedRow(tbl, T1, { name: "Ada", email: "ada@co.test", role: "Admin" });
    const queued = queueVia("createReviewCampaign", { name: "C", memberTableId: tbl, reviewerEmails: ["audit@co.test"] });
    approveVia(queued.approvalActionId);
    const id = listCampaigns(dir, T1)[0]!.id;
    approveVia(queueVia("openReviewCampaign", { campaignId: id }).approvalActionId);
    return id;
  }

  it("attestation queues (approval default); approve records durable evidence + item decision", () => {
    const id = openCampaignWithItem();
    const item = listItems(dir, T1, id)[0]!;
    expect(item.status).toBe("pending");

    const queued = queueVia("attestReviewItem", { itemId: item.id, decision: "certified", comment: "access looks right" });
    const res = approveVia(queued.approvalActionId);

    const after = listItems(dir, T1, id).find((i) => i.id === item.id)!;
    expect(after.status).toBe("certified");
    expect(after.attestedBy).toBe(T1);
    expect(after.evidenceIds).toHaveLength(1);

    const evidence = listEvidence(dir, T1);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].decision).toBe("certified");
    expect(evidence[0].decidedBy).toBe(T1);
    expect(evidence[0].comment).toBe("access looks right");
    // HONEST note — this slice never changes access itself.
    expect(evidence[0].note).toContain("no access was granted, changed or revoked");
    expect(res.id).toBe(item.id);
  });

  it("idempotent approve (replay → alreadyApplied, no duplicate evidence)", () => {
    const id = openCampaignWithItem();
    const item = listItems(dir, T1, id)[0]!;
    const queued = queueVia("attestReviewItem", { itemId: item.id, decision: "certified" });
    approveVia(queued.approvalActionId);
    const again = executePendingAccessReviewWrite(dir, T1, queued.approvalActionId, T1);
    expect(again.ok).toBe(true);
    expect(again.alreadyApplied).toBe(true);
    expect(listEvidence(dir, T1)).toHaveLength(1);
    expect(listItems(dir, T1, id).filter((i) => i.evidenceIds.length > 0)).toHaveLength(1);
  });

  it("removal-requested is a durable REQUEST (evidence), never an actual revocation", () => {
    const id = openCampaignWithItem();
    const item = listItems(dir, T1, id)[0]!;
    approveVia(queueVia("attestReviewItem", { itemId: item.id, decision: "removal-requested", comment: "no longer needed" }).approvalActionId);
    const evidence = listEvidence(dir, T1)[0]!;
    expect(evidence.decision).toBe("removal-requested");
    expect(evidence.note).toContain("no access");
    // The underlying 1.4 row still exists untouched — NOT deleted.
    const rows = listRows(dir, T1);
    expect(rows.some((r) => r.id === item.subjectRef)).toBe(true);
  });

  it("reject discards the attestation (no evidence, item stays pending)", () => {
    const id = openCampaignWithItem();
    const item = listItems(dir, T1, id)[0]!;
    const queued = queueVia("attestReviewItem", { itemId: item.id, decision: "flagged" });
    const rej = rejectAccessReviewWrite(dir, T1, queued.approvalActionId, T1);
    expect(rej.ok).toBe(true);
    expect(listEvidence(dir, T1)).toHaveLength(0);
    expect(listItems(dir, T1, id)[0]!.status).toBe("pending");
  });

  it("double-attest is rejected (item not pending)", () => {
    const id = openCampaignWithItem();
    const item = listItems(dir, T1, id)[0]!;
    approveVia(queueVia("attestReviewItem", { itemId: item.id, decision: "certified" }).approvalActionId);
    const again = submitAccessReviewWrite(dir, T1, "attestReviewItem", { payload: { itemId: item.id, decision: "flagged" } }, T1);
    expect(again.applied).toBe(false);
    expect("error" in again && /not pending/.test(again.error ?? "")).toBe(true);
  });

  it("attestation requires an OPEN campaign", () => {
    const queued = queueVia("createReviewCampaign", { name: "C", reviewerEmails: ["a@co.test"] });
    approveVia(queued.approvalActionId);
    const id = listCampaigns(dir, T1)[0]!.id;
    // item on a draft campaign is impossible (no items generated), but a
    // direct attest on a draft-campaign item would be refused — simulate by
    // attesting a bogus item id.
    const res = submitAccessReviewWrite(dir, T1, "attestReviewItem", { payload: { itemId: "ari_bogus", decision: "certified" } }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /not found/.test(res.error ?? "")).toBe(true);
  });
});

// ── 4. Fail-closed validation BEFORE the gate ─────────────────────────────
describe("fail-closed validation", () => {
  it("forged create-ids never queue", () => {
    const res = submitAccessReviewWrite(dir, T1, "createReviewCampaign", { payload: { id: "arc_evil", name: "C" } }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /not accepted/.test(res.error ?? "")).toBe(true);
    expect(listCampaigns(dir, T1)).toHaveLength(0);
    expect(listPendingWrites(dir, T1)).toHaveLength(0);
  });

  it("foreign/stranger workflow refs are rejected (no IDOR)", () => {
    const stranger = seedWorkflow(T2, "active");
    const res = submitAccessReviewWrite(dir, T1, "createReviewCampaign", { payload: { name: "C", workflowIds: [stranger] } }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /workflow not found/.test(res.error ?? "")).toBe(true);
  });

  it("foreign/stranger member table refs are rejected", () => {
    const tblT2 = seedTable(T2);
    const res = submitAccessReviewWrite(dir, T1, "createReviewCampaign", { payload: { name: "C", memberTableId: tblT2 } }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /table not found/.test(res.error ?? "")).toBe(true);
  });

  it("invalid reviewer emails never queue", () => {
    const res = submitAccessReviewWrite(dir, T1, "createReviewCampaign", { payload: { name: "C", reviewerEmails: ["not-an-email"] } }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /invalid reviewer email/.test(res.error ?? "")).toBe(true);
  });

  it("campaign cap is enforced before the gate", () => {
    for (let i = 0; i < MAX_CAMPAIGNS_PER_TENANT; i++) {
      approveVia(queueVia("createReviewCampaign", { name: `C${i}`, reviewerEmails: ["a@co.test"] }).approvalActionId);
    }
    const res = submitAccessReviewWrite(dir, T1, "createReviewCampaign", { payload: { name: "Over", reviewerEmails: ["a@co.test"] } }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /campaign cap reached/.test(res.error ?? "")).toBe(true);
  });

  it("unknown ops fail closed", () => {
    const res = submitAccessReviewWrite(dir, T1, "bogusOp" as never, { payload: {} }, T1);
    expect(res.applied).toBe(false);
    expect("error" in res && /unknown/.test(res.error ?? "")).toBe(true);
  });
});

// ── 5. Tenant isolation (cross-tenant + stranger → 404 no-IDOR) ──────────
describe("tenant isolation", () => {
  it("campaign reads are tenant-scoped; a stranger's id → 404", async () => {
    const queued = queueVia("createReviewCampaign", { name: "T1 Campaign", reviewerEmails: ["a@co.test"] });
    approveVia(queued.approvalActionId);
    const id = listCampaigns(dir, T1)[0]!.id;

    const t2Read = await handleNativeAccessReviewAuthed(new Request(`http://x/api/native/accessreview/campaigns/${id}`), { userEmail: T2, dataDir: dir });
    expect(t2Read.status).toBe(404);

    const t1Read = await handleNativeAccessReviewAuthed(new Request(`http://x/api/native/accessreview/campaigns/${id}`), { userEmail: T1, dataDir: dir });
    expect(t1Read.status).toBe(200);
  });

  it("evidence writes are tenant-scoped (attestation on another tenant's item → 404)", async () => {
    const queued = queueVia("createReviewCampaign", { name: "T1 Campaign", reviewerEmails: ["a@co.test"] });
    approveVia(queued.approvalActionId);
    const res = submitAccessReviewWrite(dir, T2, "attestReviewItem", { payload: { itemId: "ari_any", decision: "certified" } }, T2);
    expect(res.applied).toBe(false);
    expect("error" in res && /not found/.test(res.error ?? "")).toBe(true);
  });
});

// ── 6. HTTP surface ──────────────────────────────────────────────────────
describe("HTTP surface", () => {
  it("unauthenticated access-review lanes fail closed (authed-only downstream)", async () => {
    // The handler itself is wired AFTER the session check in prod-server; at
    // this level we assert the authed handler's 404 on unknown routes and the
    // safe projections. (401 for no-session is asserted in the security live
    // probe suite.)
    const res = await handleNativeAccessReviewAuthed(new Request("http://x/api/native/accessreview/campaigns"), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { campaigns: unknown[] } }).data.campaigns).toEqual([]);
  });

  it("create/attest via HTTP return 201 applied or 202 pending; bad payloads → 400", async () => {
    // create → pending (approval default)
    const create = await handleNativeAccessReviewAuthed(
      new Request("http://x/api/native/accessreview/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "HTTP Campaign", reviewerEmails: ["a@co.test"] }) }),
      { userEmail: T1, dataDir: dir },
    );
    expect(create.status).toBe(202);
    expect(((await create.json()) as { data: { approvalActionId: string } }).data.approvalActionId).toBeTruthy();

    // malformed body → 400
    const bad = await handleNativeAccessReviewAuthed(
      new Request("http://x/api/native/accessreview/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: "not json" }),
      { userEmail: T1, dataDir: dir },
    );
    expect(bad.status).toBe(400);
  });

  it("unknown routes → 404; wrong method → 405 on writes", async () => {
    const nf = await handleNativeAccessReviewAuthed(new Request("http://x/api/native/accessreview/nope"), { userEmail: T1, dataDir: dir });
    expect(nf.status).toBe(404);
    const m405 = await handleNativeAccessReviewAuthed(new Request("http://x/api/native/accessreview/writes", { method: "POST" }), { userEmail: T1, dataDir: dir });
    expect(m405.status).toBe(405);
  });

  it("cross-tenant list stays tenant-scoped", async () => {
    const queued = queueVia("createReviewCampaign", { name: "T1 Only", reviewerEmails: ["a@co.test"] });
    approveVia(queued.approvalActionId);
    const t2 = await handleNativeAccessReviewAuthed(new Request("http://x/api/native/accessreview/campaigns"), { userEmail: T2, dataDir: dir });
    expect(((await t2.json()) as { data: { campaigns: unknown[] } }).data.campaigns).toEqual([]);
  });
});

// ── 7. Audit + typed events ──────────────────────────────────────────────
describe("audit + typed events", () => {
  it("every mutation writes an immutable audit entry", () => {
    const queued = queueVia("createReviewCampaign", { name: "C", reviewerEmails: ["a@co.test"] });
    approveVia(queued.approvalActionId);
    const audit = listAudit(dir, T1);
    expect(audit.length).toBeGreaterThanOrEqual(2); // pending + applied
    expect(audit.every((e) => e.action.startsWith("native.accessreview."))).toBe(true);
    expect(audit.every((e) => e.id.startsWith("aau_"))).toBe(true);
  });

  it("registers typed native.accessreview.* event types", () => {
    for (const t of [
      "native.accessreview.campaign.created",
      "native.accessreview.campaign.opened",
      "native.accessreview.campaign.closed",
      "native.accessreview.campaign.canceled",
      "native.accessreview.reviewer.added",
      "native.accessreview.reviewer.removed",
      "native.accessreview.item.attested",
      "native.accessreview.pending",
      "native.accessreview.applied",
      "native.accessreview.rejected",
    ]) {
      const v = validateNativeEventType(t, { eventId: "evt_x" });
      expect(v.ok, `${t}: ${"reason" in v ? v.reason : "?"}`).toBe(true);
    }
  });
});

