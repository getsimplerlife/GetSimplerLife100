/**
 * native/accessreview/types.ts — Phase 4.3 native ACCESS-REVIEW /
 * CERTIFICATION-CAMPAIGN slice (periodic attestation/certification campaigns
 * over the tenant's OWN member access + workflow inventory, with a durable,
 * append-only EVIDENCE log).
 *
 * Discipline mirrors 1.4/3.4–3.8/4.1/4.2 exactly:
 *   - tenant-keyed stores + durable pending-write mirror + immutable
 *     native.accessreview.* audit; server-assigned ids ONLY
 *     (arc_/ari_/aev_/apw_/aau_),
 *   - every user-initiated WRITE rides the Approval Queue verb-first
 *     (createReviewCampaign / updateReviewCampaign / deleteReviewCampaign /
 *     openReviewCampaign / closeReviewCampaign / cancelReviewCampaign /
 *     addCampaignReviewer / removeCampaignReviewer / attestReviewItem —
 *     `attest` is a NEW WRITE_VERB added by this slice; without it,
 *     attestReviewItem would be classified a READ and BYPASS the queue —
 *     the classification test locks the fail-open guard),
 *   - validation BEFORE the gate: forged create-ids, unknown in-tenant
 *     member-table/row references, unknown workflow refs, caps and malformed
 *     payloads NEVER queue (fail-closed),
 *   - HONEST OUTCOMES ONLY: opening a campaign generates a read-only
 *     snapshot of the tenant's OWN access + workflow inventory (from 1.4
 *     rows / 3.7 automation rules); attestReviewItem records a durable
 *     ATTESTATION (certified / flagged / removal-requested) + evidence —
 *     this slice NEVER changes access itself ("no access was granted,
 *     changed or revoked by this slice"),
 *   - typed events native.accessreview.* via the Phase 1.1 registry;
 *     authed-only surface (401 fail-closed); NO public share lane.
 */
export const NATIVE_ACCESSREVIEW_CAMPAIGNS_KEY = "accessreview_campaigns.json";
export const NATIVE_ACCESSREVIEW_ITEMS_KEY = "accessreview_items.json";
export const NATIVE_ACCESSREVIEW_EVIDENCE_KEY = "accessreview_evidence.json";
export const NATIVE_ACCESSREVIEW_PENDING_KEY = "accessreview_pending.json";
export const NATIVE_ACCESSREVIEW_AUDIT_KEY = "accessreview_audit.json";
export const NATIVE_ACCESSREVIEW_PROVIDER = "native-accessreview";
export const NATIVE_ACCESSREVIEW_WORKFLOW_ID = "native-accessreview";

// ── Caps (fail-closed; enforced in gate.ts BEFORE the gate) ────────────────
export const MAX_CAMPAIGNS_PER_TENANT = 20;
export const MAX_REVIEW_ITEMS_PER_CAMPAIGN = 500;
export const MAX_REVIEWERS_PER_CAMPAIGN = 10;
export const MAX_EVIDENCE_ENTRIES = 500;
export const MAX_PENDING_ACCESSREVIEW_WRITES = 50;
export const MAX_DAILY_ATTESTATIONS = 200;
export const MAX_DAILY_CAMPAIGN_OPENS = 20;
export const MAX_CAMPAIGN_NAME = 120;
export const MAX_CAMPAIGN_DESCRIPTION = 300;
export const MAX_COMMENT_CHARS = 500;
export const MAX_MEMBER_SUBJECT_CHARS = 120;
export const MAX_WORKFLOW_SUBJECT_CHARS = 120;
export const MAX_INTENT_CHARS = 200; // cadence / scope intent
export const MAX_SNAPSHOT_CHARS = 4000; // bounded access/workflow snapshot

export const CAMPAIGN_CADENCES = ["on-demand", "monthly", "quarterly", "semi-annual", "annual"] as const;
export type CampaignCadence = (typeof CAMPAIGN_CADENCES)[number];
export const CAMPAIGN_STATUSES = ["draft", "open", "closed", "canceled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const REVIEW_ITEM_STATUSES = ["pending", "certified", "flagged", "removal-requested"] as const;
export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number];
export const ATTEST_DECISIONS = ["certified", "flagged", "removal-requested"] as const;
export type AttestDecision = (typeof ATTEST_DECISIONS)[number];

/** A review campaign: scope + reviewers + cadence over tenant's OWN data. */
export interface ReviewCampaign {
  id: string; // arc_<random> — server-assigned
  tenantId: string;
  name: string;
  description: string;
  cadence: CampaignCadence;
  /** Optional member-table scope: when set, open() snapshots rows from the
   *  tenant's OWN 1.4 table; otherwise workflow inventory only. */
  memberTableId?: string;
  /** Optional workflow refs: when empty, open() snapshots the tenant's ACTIVE
   *  3.7 automation rules; refs are validated in-tenant (stranger → 400). */
  workflowIds: string[];
  reviewerEmails: string[]; // validated; reviewers attest items
  status: CampaignStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  openedAt?: string;
  openedBy?: string;
  closedAt?: string;
  closedBy?: string;
  canceledAt?: string;
  canceledBy?: string;
  itemsGenerated: number;
}

/** A review item — one member or workflow in scope, generated at open() as a
 *  READ-ONLY snapshot. Attestation records a decision + evidence; this slice
 *  never changes the underlying access. */
export interface ReviewItem {
  id: string; // ari_<random> — server-assigned
  tenantId: string;
  campaignId: string;
  kind: "member" | "workflow";
  /** 1.4 row id (member) or 3.7 workflow id — resolved in-tenant. */
  subjectRef: string;
  subjectName: string; // bounded safe projection
  /** Read-only bounded snapshot captured at open() (safe projection only). */
  snapshot: string;
  status: ReviewItemStatus;
  /** Decision evidence (id of the aev_ entry once attested). */
  evidenceIds: string[];
  createdAt: string;
  attestedAt?: string;
  attestedBy?: string;
}

/** Append-only EVIDENCE log entry — the durable attestation record. */
export interface EvidenceEntry {
  id: string; // aev_<random> — server-assigned
  tenantId: string;
  campaignId: string;
  itemId: string;
  decision: AttestDecision;
  decidedBy: string;
  comment: string;
  /** Honest note: this slice never changes access itself. */
  note: string;
  createdAt: string;
}

export interface PendingAccessReviewWrite {
  id: string; // apw_<random> — server-assigned
  tenantId: string;
  op: AccessReviewOp;
  action: string; // approval action name (verb-first)
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: Record<string, unknown>;
  error?: string;
}

export interface NativeAccessReviewAuditEntry {
  id: string; // aau_<random> — server-assigned
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.accessreview.*
  entityId?: string;
  detail: string;
}

export type AccessReviewOp =
  | "createReviewCampaign"
  | "updateReviewCampaign"
  | "deleteReviewCampaign"
  | "openReviewCampaign"
  | "closeReviewCampaign"
  | "cancelReviewCampaign"
  | "addCampaignReviewer"
  | "removeCampaignReviewer"
  | "attestReviewItem";