/**
 * native/accessreview/gate.ts — GATED WRITE PATH for Phase 4.3 native
 * ACCESS-REVIEW / CERTIFICATION-CAMPAIGN slice (periodic attestation/
 * certification campaigns over the tenant's OWN member access + workflow
 * inventory, with a durable append-only EVIDENCE log).
 *
 * Mirrors the 3.4–3.8/4.1/4.2 gates exactly:
 *   - validation BEFORE the gate (forged create-ids, unknown in-tenant
 *     member-table/row references, unknown workflow refs, caps, malformed
 *     payloads NEVER queue) — fail-closed,
 *   - every mutation rides the Approval Queue verb-first: createReviewCampaign
 *     / updateReviewCampaign / deleteReviewCampaign / openReviewCampaign /
 *     closeReviewCampaign / cancelReviewCampaign / addCampaignReviewer /
 *     removeCampaignReviewer / attestReviewItem — create/update/delete/open/
 *     close/cancel/add/remove are ALREADY in WRITE_VERB; `attestReviewItem`
 *     REQUIRES the NEW `attest` verb ADDED to WRITE_VERB by this slice
 *     (classification test locks the fail-open guard: without `attest`, the
 *     certification write would be classified a READ and BYPASS the Approval
 *     Queue),
 *   - server-assigned ids ONLY (client-supplied ids on create → 400),
 *   - HONEST OUTCOMES: opening a campaign snapshots the tenant's OWN access +
 *     workflow inventory (safe projections, bounded); attestReviewItem records
 *     a durable ATTESTATION (certified / flagged / removal-requested) +
 *     append-only evidence; the slice NEVER changes access itself
 *     ("no access was granted, changed or revoked by this slice"),
 *   - a campaign may only be deleted while it is a draft (no items, no
 *     evidence — nothing to lose); open/close/cancel transitions are
 *     validated state machines,
 *   - the durable pending-write mirror lands with each approval card; the
 *     approve-path executor is idempotent (replay → alreadyApplied),
 *   - autonomy (#236): allow-listed actions auto-apply with
 *     recordAutonomyOutcome in the shared gate rules.
 */
import { approvalGate, markApproved, markRejected, type ApprovalGateOutcome } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import { getRow, getTable, listRows } from "../tables/store";
import { getRule, listRules } from "../automation/store";
import {
  ATTEST_DECISIONS,
  CAMPAIGN_CADENCES,
  MAX_CAMPAIGNS_PER_TENANT,
  MAX_CAMPAIGN_NAME,
  MAX_CAMPAIGN_DESCRIPTION,
  MAX_COMMENT_CHARS,
  MAX_DAILY_ATTESTATIONS,
  MAX_DAILY_CAMPAIGN_OPENS,
  MAX_EVIDENCE_ENTRIES,
  MAX_MEMBER_SUBJECT_CHARS,
  MAX_PENDING_ACCESSREVIEW_WRITES,
  MAX_REVIEWERS_PER_CAMPAIGN,
  MAX_REVIEW_ITEMS_PER_CAMPAIGN,
  MAX_SNAPSHOT_CHARS,
  MAX_WORKFLOW_SUBJECT_CHARS,
  NATIVE_ACCESSREVIEW_PROVIDER,
  NATIVE_ACCESSREVIEW_WORKFLOW_ID,
  type AccessReviewOp,
  type AttestDecision,
  type EvidenceEntry,
  type PendingAccessReviewWrite,
  type ReviewCampaign,
  type ReviewItem,
} from "./types";
import {
  appendAudit,
  appendEvidence,
  countEvidence,
  countItemsForCampaign,
  deleteCampaignRecord,
  generateAccessReviewEntityId,
  getCampaign,
  getEvidence,
  getItem,
  getPendingWriteByAction,
  listCampaigns,
  listEvidence,
  listItems,
  listPendingWrites,
  markPendingWrite,
  saveCampaign,
  saveItem,
  savePendingWrite,
} from "./store";

/** Verb-first action names — every verb ∈ WRITE_VERB. `attest` is the NEW
 *  verb added by this slice (classification test asserts all nine; this
 *  slice's standing fail-open control). */
const ACTION_NAME: Record<AccessReviewOp, string> = {
  createReviewCampaign: "createReviewCampaign",
  updateReviewCampaign: "updateReviewCampaign",
  deleteReviewCampaign: "deleteReviewCampaign",
  openReviewCampaign: "openReviewCampaign",
  closeReviewCampaign: "closeReviewCampaign",
  cancelReviewCampaign: "cancelReviewCampaign",
  addCampaignReviewer: "addCampaignReviewer",
  removeCampaignReviewer: "removeCampaignReviewer",
  attestReviewItem: "attestReviewItem",
};

export type AccessReviewWriteResult =
  | { applied: true; pending: false; op: AccessReviewOp; id?: string; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: AccessReviewOp }
  | { applied: false; pending: false; error: string };

// ── validation helpers (fail-closed, BEFORE the gate) ────────────────────────
function assertName(v: unknown): string {
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("name is required");
  const name = v.trim();
  if (name.length > MAX_CAMPAIGN_NAME) throw new Error(`name must be ≤${MAX_CAMPAIGN_NAME} characters`);
  return name;
}
function assertDescription(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new Error("description must be a string");
  const d = v.trim();
  if (d.length > MAX_CAMPAIGN_DESCRIPTION) throw new Error(`description must be ≤${MAX_CAMPAIGN_DESCRIPTION} characters`);
  return d;
}
function assertCadence(v: unknown): ReviewCampaign["cadence"] {
  const c = v as ReviewCampaign["cadence"];
  if (!CAMPAIGN_CADENCES.includes(c)) throw new Error(`cadence must be ${CAMPAIGN_CADENCES.join("|")}`);
  return c;
}
function assertMemberTable(dataDir: string, tenantId: string, v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || v.trim().length === 0) throw new Error("memberTableId must be a table id");
  if (!getTable(dataDir, tenantId, v)) throw new Error("table not found"); // foreign/stranger → 400 (no IDOR)
  return v;
}
function assertWorkflowIds(dataDir: string, tenantId: string, v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("workflowIds must be an array of workflow ids");
  const ids: string[] = [];
  for (const id of v) {
    if (typeof id !== "string" || id.trim().length === 0) throw new Error("each workflowId must be a workflow id");
    const rule = getRule(dataDir, tenantId, id);
    if (!rule) throw new Error("workflow not found"); // foreign/stranger → 400 (no IDOR)
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
function assertReviewerEmails(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("reviewerEmails must be an array");
  const list: string[] = [];
  for (const e of v) {
    if (typeof e !== "string" || e.trim().length === 0 || e.length > 200) throw new Error("each reviewer must be an email");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())) throw new Error(`invalid reviewer email "${e}"`);
    if (!list.includes(e.trim())) list.push(e.trim());
  }
  return list;
}
function assertComment(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new Error("comment must be a string");
  const c = v.trim();
  if (c.length > MAX_COMMENT_CHARS) throw new Error(`comment must be ≤${MAX_COMMENT_CHARS} characters`);
  return c;
}
function assertDecision(v: unknown): AttestDecision {
  const d = v as AttestDecision;
  if (!ATTEST_DECISIONS.includes(d)) throw new Error(`decision must be ${ATTEST_DECISIONS.join("|")}`);
  return d;
}

/** Validate the campaign payload production-style (create + update merged). */
function validateCampaign(
  dataDir: string,
  tenantId: string,
  body: Record<string, unknown>,
): {
  name: string;
  description: string;
  cadence: ReviewCampaign["cadence"];
  memberTableId?: string;
  workflowIds: string[];
  reviewerEmails: string[];
} {
  if (body.id !== undefined) throw new Error("client-supplied campaign ids are not accepted"); // forged create-id → 400
  const name = assertName(body.name);
  const description = assertDescription(body.description);
  const cadence = assertCadence(body.cadence ?? "on-demand");
  const memberTableId = assertMemberTable(dataDir, tenantId, body.memberTableId);
  const workflowIds = assertWorkflowIds(dataDir, tenantId, body.workflowIds);
  const reviewerEmails = assertReviewerEmails(body.reviewerEmails);
  return { name, description, cadence, memberTableId, workflowIds, reviewerEmails };
}

/** Bound a read-only snapshot of a member row (safe projection only). */
function memberSnapshot(row: NonNullable<ReturnType<typeof getRow>>): { name: string; snapshot: string } {
  const data = (row?.data ?? {}) as Record<string, unknown>;
  const nameKey = ["name", "full_name", "email", "title"].find((k) => typeof data[k] === "string" && String(data[k]).trim());
  const name = nameKey ? String(data[nameKey]).trim().slice(0, MAX_MEMBER_SUBJECT_CHARS) : row.id;
  const projection: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (projectionCount(projection) >= 8) break; // bounded: first 8 safe scalar fields
    if (["string", "number", "boolean"].includes(typeof v)) projection[k] = String(v).slice(0, 200);
  }
  return { name, snapshot: JSON.stringify({ rowId: row.id, tableId: row.tableId, data: projection }).slice(0, MAX_SNAPSHOT_CHARS) };
}
function projectionCount(o: Record<string, unknown>): number {
  return Object.keys(o).length;
}

/** Bound a read-only snapshot of a workflow (safe projection only). */
function workflowSnapshot(rule: { id: string; name: string; status: string }): { name: string; snapshot: string } {
  return {
    name: rule.name.slice(0, MAX_WORKFLOW_SUBJECT_CHARS),
    snapshot: JSON.stringify({ workflowId: rule.id, name: rule.name.slice(0, 160), status: rule.status }).slice(0, MAX_SNAPSHOT_CHARS),
  };
}

/** Validate + normalize the payload into what applyNow persists. */
function prepareWrite(dataDir: string, tenantId: string, op: AccessReviewOp, payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object");
  switch (op) {
    case "createReviewCampaign": {
      if (listCampaigns(dataDir, tenantId).length >= MAX_CAMPAIGNS_PER_TENANT) {
        throw new Error(`campaign cap reached (${MAX_CAMPAIGNS_PER_TENANT})`);
      }
      return validateCampaign(dataDir, tenantId, payload) as unknown as Record<string, unknown>;
    }
    case "updateReviewCampaign": {
      if (typeof payload.campaignId !== "string" || !getCampaign(dataDir, tenantId, payload.campaignId)) throw new Error("campaign not found");
      const base = getCampaign(dataDir, tenantId, payload.campaignId)!;
      if (base.status !== "draft") throw new Error("only draft campaigns can be edited");
      const merged: Record<string, unknown> = {
        description: base.description,
        cadence: base.cadence,
        memberTableId: base.memberTableId,
        workflowIds: base.workflowIds,
        reviewerEmails: base.reviewerEmails,
        name: base.name,
        ...payload,
        id: undefined,
        campaignId: undefined,
      };
      const v = validateCampaign(dataDir, tenantId, merged);
      return { ...v, campaignId: base.id } as unknown as Record<string, unknown>;
    }
    case "deleteReviewCampaign": {
      if (typeof payload.campaignId !== "string" || !getCampaign(dataDir, tenantId, payload.campaignId)) throw new Error("campaign not found");
      const c = getCampaign(dataDir, tenantId, payload.campaignId)!;
      if (c.status !== "draft") throw new Error("only draft campaigns can be deleted (open/closed campaigns keep their evidence)");
      return { campaignId: c.id } as Record<string, unknown>;
    }
    case "openReviewCampaign": {
      if (typeof payload.campaignId !== "string" || !getCampaign(dataDir, tenantId, payload.campaignId)) throw new Error("campaign not found");
      const c = getCampaign(dataDir, tenantId, payload.campaignId)!;
      if (c.status !== "draft") throw new Error("only draft campaigns can be opened");
      if (countOpensToday(dataDir, tenantId) >= MAX_DAILY_CAMPAIGN_OPENS) {
        throw new Error(`daily campaign-open cap (${MAX_DAILY_CAMPAIGN_OPENS}) reached`);
      }
      return { campaignId: c.id } as Record<string, unknown>;
    }
    case "closeReviewCampaign": {
      if (typeof payload.campaignId !== "string" || !getCampaign(dataDir, tenantId, payload.campaignId)) throw new Error("campaign not found");
      const c = getCampaign(dataDir, tenantId, payload.campaignId)!;
      if (c.status !== "open") throw new Error("only open campaigns can be closed");
      return { campaignId: c.id } as Record<string, unknown>;
    }
    case "cancelReviewCampaign": {
      if (typeof payload.campaignId !== "string" || !getCampaign(dataDir, tenantId, payload.campaignId)) throw new Error("campaign not found");
      const c = getCampaign(dataDir, tenantId, payload.campaignId)!;
      if (c.status !== "draft" && c.status !== "open") throw new Error("only draft or open campaigns can be canceled");
      return { campaignId: c.id } as Record<string, unknown>;
    }
    case "addCampaignReviewer": {
      if (typeof payload.campaignId !== "string" || !getCampaign(dataDir, tenantId, payload.campaignId)) throw new Error("campaign not found");
      const c = getCampaign(dataDir, tenantId, payload.campaignId)!;
      if (c.status !== "draft") throw new Error("reviewers can only be added to draft campaigns");
      if (c.reviewerEmails.length >= MAX_REVIEWERS_PER_CAMPAIGN) {
        throw new Error(`reviewer cap reached (${MAX_REVIEWERS_PER_CAMPAIGN})`);
      }
      const email = assertReviewerEmails([payload.email])[0] ?? (() => { throw new Error("email is required"); })();
      if (c.reviewerEmails.includes(email)) throw new Error("reviewer already on this campaign");
      return { campaignId: c.id, email };
    }
    case "removeCampaignReviewer": {
      if (typeof payload.campaignId !== "string" || !getCampaign(dataDir, tenantId, payload.campaignId)) throw new Error("campaign not found");
      const c = getCampaign(dataDir, tenantId, payload.campaignId)!;
      if (c.status !== "draft") throw new Error("reviewers can only be removed from draft campaigns");
      const email = typeof payload.email === "string" ? payload.email : "";
      if (!email || !c.reviewerEmails.includes(email)) throw new Error("campaign does not have that reviewer");
      return { campaignId: c.id, email };
    }
    case "attestReviewItem": {
      if (typeof payload.itemId !== "string" || !getItem(dataDir, tenantId, payload.itemId)) throw new Error("item not found");
      const item = getItem(dataDir, tenantId, payload.itemId)!;
      if (item.status !== "pending") throw new Error("item is not pending (already attested)");
      const campaign = getCampaign(dataDir, tenantId, item.campaignId);
      if (!campaign || campaign.status !== "open") throw new Error("campaign is not open");
      if (countEvidence(dataDir, tenantId) >= MAX_EVIDENCE_ENTRIES) {
        throw new Error(`evidence cap reached (${MAX_EVIDENCE_ENTRIES})`);
      }
      if (countAttestationsToday(dataDir, tenantId) >= MAX_DAILY_ATTESTATIONS) {
        throw new Error(`daily attestation cap (${MAX_DAILY_ATTESTATIONS}) reached`);
      }
      const decision = assertDecision(payload.decision);
      const comment = assertComment(payload.comment);
      return { itemId: item.id, decision, comment };
    }
    default:
      throw new Error("unknown access-review op");
  }
}

function countAttestationsToday(dataDir: string, tenantId: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return listEvidence(dataDir, tenantId).filter((e) => e.createdAt.slice(0, 10) === today).length;
}

function countOpensToday(dataDir: string, tenantId: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return listCampaigns(dataDir, tenantId).filter((c) => (c.openedAt ?? "").slice(0, 10) === today).length;
}

/** Execute the write under authority (autonomy auto-apply or approve path). */
function applyNow(
  dataDir: string,
  tenantId: string,
  op: AccessReviewOp,
  p: Record<string, unknown>,
  actor: string,
  autonomy: boolean,
): { ok: true; id?: string } | { ok: false; error: string } {
  const now = new Date().toISOString();
  const auditActor = autonomy ? "system/autonomy" : actor;
  const suffix = autonomy ? " (autonomy)" : "";
  try {
    if (op === "createReviewCampaign") {
      const c: ReviewCampaign = {
        id: generateAccessReviewEntityId("arc"),
        tenantId,
        name: p.name as string,
        description: p.description as string,
        cadence: p.cadence as ReviewCampaign["cadence"],
        memberTableId: (p.memberTableId as string | undefined) || undefined,
        workflowIds: p.workflowIds as string[],
        reviewerEmails: p.reviewerEmails as string[],
        status: "draft",
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor,
        itemsGenerated: 0,
      };
      saveCampaign(dataDir, c);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.accessreview.campaign.created", entityId: c.id, detail: `Created access-review campaign "${c.name}" (${c.cadence}, ${c.reviewerEmails.length} reviewer(s))${suffix}` });
      publishEvent(dataDir, tenantId, "native.accessreview.campaign.created", { campaignId: c.id, name: c.name });
      return { ok: true, id: c.id };
    }
    if (op === "updateReviewCampaign") {
      const base = getCampaign(dataDir, tenantId, p.campaignId as string);
      if (!base) return { ok: false, error: "campaign not found" };
      const next: ReviewCampaign = { ...base, name: p.name as string, description: p.description as string, cadence: p.cadence as ReviewCampaign["cadence"], memberTableId: (p.memberTableId as string | undefined) || undefined, workflowIds: p.workflowIds as string[], reviewerEmails: p.reviewerEmails as string[], updatedAt: now, updatedBy: actor };
      saveCampaign(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.accessreview.campaign.updated", entityId: base.id, detail: `Updated campaign "${next.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.accessreview.campaign.updated", { campaignId: base.id, name: next.name });
      return { ok: true, id: base.id };
    }
    if (op === "deleteReviewCampaign") {
      deleteCampaignRecord(dataDir, tenantId, p.campaignId as string);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.accessreview.campaign.deleted", entityId: p.campaignId as string, detail: `Deleted draft campaign${suffix}` });
      publishEvent(dataDir, tenantId, "native.accessreview.campaign.deleted", { campaignId: p.campaignId });
      return { ok: true, id: p.campaignId as string };
    }
    if (op === "openReviewCampaign") {
      const base = getCampaign(dataDir, tenantId, p.campaignId as string);
      if (!base) return { ok: false, error: "campaign not found" };
      const opened = openCampaign(dataDir, tenantId, base, actor, now);
      if (!opened.ok) return { ok: false, error: opened.error };
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.accessreview.campaign.opened", entityId: base.id, detail: `Opened campaign "${base.name}" — generated ${opened.itemsGenerated} review item(s)${suffix}` });
      publishEvent(dataDir, tenantId, "native.accessreview.campaign.opened", { campaignId: base.id, itemsGenerated: opened.itemsGenerated });
      return { ok: true, id: base.id };
    }
    if (op === "closeReviewCampaign") {
      const base = getCampaign(dataDir, tenantId, p.campaignId as string);
      if (!base) return { ok: false, error: "campaign not found" };
      const next: ReviewCampaign = { ...base, status: "closed", closedAt: now, closedBy: actor, updatedAt: now, updatedBy: actor };
      saveCampaign(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.accessreview.campaign.closed", entityId: base.id, detail: `Closed campaign "${base.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.accessreview.campaign.closed", { campaignId: base.id });
      return { ok: true, id: base.id };
    }
    if (op === "cancelReviewCampaign") {
      const base = getCampaign(dataDir, tenantId, p.campaignId as string);
      if (!base) return { ok: false, error: "campaign not found" };
      const next: ReviewCampaign = { ...base, status: "canceled", canceledAt: now, canceledBy: actor, updatedAt: now, updatedBy: actor };
      saveCampaign(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.accessreview.campaign.canceled", entityId: base.id, detail: `Canceled campaign "${base.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.accessreview.campaign.canceled", { campaignId: base.id });
      return { ok: true, id: base.id };
    }
    if (op === "addCampaignReviewer") {
      const base = getCampaign(dataDir, tenantId, p.campaignId as string);
      if (!base) return { ok: false, error: "campaign not found" };
      const next: ReviewCampaign = { ...base, reviewerEmails: [...base.reviewerEmails, p.email as string], updatedAt: now, updatedBy: actor };
      saveCampaign(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.accessreview.reviewer.added", entityId: base.id, detail: `Added reviewer ${p.email as string} to campaign "${base.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.accessreview.reviewer.added", { campaignId: base.id, email: p.email });
      return { ok: true, id: base.id };
    }
    if (op === "removeCampaignReviewer") {
      const base = getCampaign(dataDir, tenantId, p.campaignId as string);
      if (!base) return { ok: false, error: "campaign not found" };
      const next: ReviewCampaign = { ...base, reviewerEmails: base.reviewerEmails.filter((e) => e !== (p.email as string)), updatedAt: now, updatedBy: actor };
      saveCampaign(dataDir, next);
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.accessreview.reviewer.removed", entityId: base.id, detail: `Removed reviewer ${p.email as string} from campaign "${base.name}"${suffix}` });
      publishEvent(dataDir, tenantId, "native.accessreview.reviewer.removed", { campaignId: base.id, email: p.email });
      return { ok: true, id: base.id };
    }
    if (op === "attestReviewItem") {
      const att = applyAttestation(dataDir, tenantId, p, actor, now);
      if (!att.ok) return { ok: false, error: att.error };
      appendAudit(dataDir, { tenantId, actor: auditActor, action: "native.accessreview.item.attested", entityId: p.itemId as string, detail: `Attested item ${p.itemId as string}: ${p.decision as string}${suffix}` });
      publishEvent(dataDir, tenantId, "native.accessreview.item.attested", { itemId: p.itemId, decision: p.decision });
      return { ok: true, id: p.itemId as string };
    }
    return { ok: false, error: "unknown access-review op" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** Open a campaign: snapshot the tenant's OWN member rows (safe projections)
 *  + workflow inventory into review items. Honest: no access changes happen. */
function openCampaign(
  dataDir: string,
  tenantId: string,
  campaign: ReviewCampaign,
  actor: string,
  now: string,
): { ok: true; itemsGenerated: number } | { ok: false; error: string } {
  try {
    if (countItemsForCampaign(dataDir, tenantId, campaign.id) > 0) {
      return { ok: false, error: "campaign already has generated items" };
    }
    let itemsGenerated = 0;
    // Member inventory (tenant's OWN rows — safe projection only).
    if (campaign.memberTableId) {
      const table = getTable(dataDir, tenantId, campaign.memberTableId);
      if (!table) return { ok: false, error: "member table not found" };
      const rows = listRows(dataDir, tenantId, campaign.memberTableId);
      for (const row of rows) {
        if (itemsGenerated >= MAX_REVIEW_ITEMS_PER_CAMPAIGN) break;
        const { name, snapshot } = memberSnapshot(row);
        const item: ReviewItem = {
          id: generateAccessReviewEntityId("ari"),
          tenantId,
          campaignId: campaign.id,
          kind: "member",
          subjectRef: row.id,
          subjectName: name,
          snapshot,
          status: "pending",
          evidenceIds: [],
          createdAt: now,
        };
        saveItem(dataDir, item);
        itemsGenerated++;
      }
    }
    // Workflow inventory (tenant's own 3.7 rules — active by default).
    const rules = campaign.workflowIds.length > 0
      ? campaign.workflowIds.map((id) => getRule(dataDir, tenantId, id)).filter((r): r is NonNullable<typeof r> => r !== null)
      : listRules(dataDir, tenantId).filter((r) => r.status === "active");
    for (const rule of rules) {
      if (itemsGenerated >= MAX_REVIEW_ITEMS_PER_CAMPAIGN) break;
      const { name, snapshot } = workflowSnapshot(rule);
      const item: ReviewItem = {
        id: generateAccessReviewEntityId("ari"),
        tenantId,
        campaignId: campaign.id,
        kind: "workflow",
        subjectRef: rule.id,
        subjectName: name,
        snapshot,
        status: "pending",
        evidenceIds: [],
        createdAt: now,
      };
      saveItem(dataDir, item);
      itemsGenerated++;
    }
    const next: ReviewCampaign = { ...campaign, status: "open", openedAt: now, openedBy: actor, itemsGenerated, updatedAt: now, updatedBy: actor };
    saveCampaign(dataDir, next);
    return { ok: true, itemsGenerated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/** Record an ATTESTATION decision + append-only evidence. The slice never
 *  changes access itself — this is an attestation record, not a permission
 *  mutation. */
function applyAttestation(
  dataDir: string,
  tenantId: string,
  p: Record<string, unknown>,
  actor: string,
  now: string,
): { ok: true; evidenceId: string } | { ok: false; error: string } {
  try {
    const item = getItem(dataDir, tenantId, p.itemId as string);
    if (!item || item.status !== "pending") return { ok: false, error: "item not found or not pending" };
    const campaign = getCampaign(dataDir, tenantId, item.campaignId);
    if (!campaign || campaign.status !== "open") return { ok: false, error: "campaign is not open" };
    const evidence: EvidenceEntry = {
      id: generateAccessReviewEntityId("aev"),
      tenantId,
      campaignId: campaign.id,
      itemId: item.id,
      decision: p.decision as AttestDecision,
      decidedBy: actor,
      comment: (p.comment as string) ?? "",
      note: "Attestation record only — no access was granted, changed or revoked by this slice.",
      createdAt: now,
    };
    appendEvidence(dataDir, evidence);
    const next: ReviewItem = { ...item, status: p.decision as ReviewItem["status"], evidenceIds: [...item.evidenceIds, evidence.id], attestedAt: now, attestedBy: actor };
    saveItem(dataDir, next);
    return { ok: true, evidenceId: evidence.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Submit a gated access-review write. Validation FIRST — bad writes 400 before
 * the queue. Returns applied / pending / error.
 */
export function submitAccessReviewWrite(
  dataDir: string,
  tenantId: string,
  op: AccessReviewOp,
  req: { payload: Record<string, unknown>; via?: string },
  actor: string,
): AccessReviewWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  const payload = req.payload ?? {};
  const action = ACTION_NAME[op];

  // 1. Fail-closed validation BEFORE the gate + cap pre-checks.
  let prepared: Record<string, unknown>;
  try {
    prepared = prepareWrite(dataDir, tenantId, op, payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }

  // 2. Gate (verb-first — attestReviewItem rides the NEW `attest` WRITE verb).
  const gate: ApprovalGateOutcome = approvalGate(tenantId, action, NATIVE_ACCESSREVIEW_PROVIDER, { op, via: req.via ?? "portal" }, { dataDir, workflowId: NATIVE_ACCESSREVIEW_WORKFLOW_ID });
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  if (gate.allowed) {
    const out = applyNow(dataDir, tenantId, op, prepared, actor, !!gate.autonomy);
    if (!out.ok) return { applied: false, pending: false, error: out.error };
    if (gate.autonomy) recordAutonomyOutcome(tenantId, NATIVE_ACCESSREVIEW_WORKFLOW_ID, action, NATIVE_ACCESSREVIEW_PROVIDER, true, { dataDir, allowListId: gate.allowListId, target: out.id ?? "" });
    return { applied: true, pending: false, op, id: out.id, autonomy: !!gate.autonomy, actionId: gate.actionId };
  }

  // 3. Queue: cap the pending mirror, then persist the durable card.
  const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
  if (pending.length >= MAX_PENDING_ACCESSREVIEW_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_ACCESSREVIEW_WRITES}) — approve or reject before more` };
  }
  const apw: PendingAccessReviewWrite = {
    id: generateAccessReviewEntityId("apw"),
    tenantId,
    op,
    action,
    payload: prepared,
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, apw);
  appendAudit(dataDir, { tenantId, actor, action: auditActionFor(op, "pending"), entityId: apw.id, detail: `Queued ${action} for approval (${apw.id})` });
  publishEvent(dataDir, tenantId, eventTypeFor(op, "pending"), { op, apwId: apw.id });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Approve-path executor: applies the approved write once (idempotent). */
export function executePendingAccessReviewWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; id?: string; apwId: string; alreadyApplied?: boolean } | { ok: false; reason: string; apwId?: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const apw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!apw) return { ok: false, reason: "no pending write for this approval action" };
  if (apw.status === "rejected") return { ok: false, reason: "write was rejected" };
  if (apw.status === "applied") {
    return { ok: true, alreadyApplied: true, id: (apw.appliedResult?.id as string) ?? undefined, apwId: apw.id };
  }
  // Re-validate at apply time (authority does not bypass the contract).
  let prepared: Record<string, unknown>;
  try {
    prepared = prepareWrite(dataDir, tenantId, apw.op, apw.payload as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, apw.id, "rejected", { error: msg });
    return { ok: false, reason: msg, apwId: apw.id };
  }
  const out = applyNow(dataDir, tenantId, apw.op, prepared, actor, false);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, apw.id, "rejected", { error: out.error });
    return { ok: false, reason: out.error, apwId: apw.id };
  }
  markPendingWrite(dataDir, tenantId, apw.id, "applied", { appliedResult: { id: out.id } });
  return { ok: true, id: out.id, apwId: apw.id };
}

/** REJECT path — the card is discarded; nothing is written. */
export function rejectAccessReviewWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; already?: boolean } | { ok: false; reason: string } {
  const apw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!apw) return { ok: false, reason: "no pending write for this approval action" };
  if (apw.status !== "pending") return { ok: true, already: true };
  markPendingWrite(dataDir, tenantId, apw.id, "rejected", { error: "rejected by owner" });
  markRejected(tenantId, apw.approvalActionId, actor, dataDir);
  appendAudit(dataDir, { tenantId, actor, action: auditActionFor(apw.op, "rejected"), entityId: apw.id, detail: `Rejected ${apw.action} (${apw.id})` });
  publishEvent(dataDir, tenantId, eventTypeFor(apw.op, "rejected"), { op: apw.op, apwId: apw.id });
  return { ok: true };
}

/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const apw = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!apw || apw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingAccessReviewWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(
      tenantId,
      approvalActionId,
      owner,
      { result: res.ok ? { status: res.alreadyApplied ? "already-applied" : "applied", id: res.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) },
      dataDir,
    );
  } else {
    markPendingWrite(dataDir, tenantId, apw.id, "rejected", { error: "rejected by owner" });
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

/** Audit action name for an op+phase (native.accessreview.*). */
function auditActionFor(op: AccessReviewOp, phase: "pending" | "applied" | "rejected"): string {
  void op;
  return phase === "rejected" ? "native.accessreview.rejected" : "native.accessreview.pending";
}
function eventTypeFor(op: AccessReviewOp, phase: "pending" | "applied" | "rejected"): string {
  void op;
  if (phase === "pending") return "native.accessreview.pending";
  if (phase === "rejected") return "native.accessreview.rejected";
  return "native.accessreview.applied";
}

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, NATIVE_ACCESSREVIEW_PROVIDER);
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}

// ── Safe GET projections ─────────────────────────────────────────────────────
export function publicCampaign(c: ReviewCampaign): ReviewCampaign {
  return { ...c };
}
export function publicItem(i: ReviewItem): ReviewItem {
  return { ...i };
}
export function publicEvidence(e: EvidenceEntry): EvidenceEntry {
  return { ...e };
}
export function getActionName(op: AccessReviewOp): string {
  return ACTION_NAME[op];
}
export { listItems, listEvidence, getEvidence };