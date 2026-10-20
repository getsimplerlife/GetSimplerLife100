/**
 * native/accessreview/index.ts — Phase 4.3 native ACCESS-REVIEW /
 * CERTIFICATION-CAMPAIGN slice. Barrel. Periodic attestation/certification
 * campaigns over the tenant's OWN member access + workflow inventory with a
 * durable append-only EVIDENCE log. Every mutation rides the Approval Queue
 * verb-first (`attestReviewItem` rides the NEW `attest` WRITE_VERB added by
 * this slice); opening a campaign snapshots safe projections of the tenant's
 * own rows + workflows; attestation records a durable decision + evidence and
 * NEVER changes access itself ("no access was granted, changed or revoked by
 * this slice").
 */
import { handleNativeAccessReviewAuthed, registerBuiltinNativeAccessReviewEventTypes, type NativeAccessReviewCtx } from "./router";
import {
  submitAccessReviewWrite,
  executePendingAccessReviewWrite,
  rejectAccessReviewWrite,
  noteOwnerDecision,
  publicCampaign,
  publicItem,
  publicEvidence,
  getActionName,
} from "./gate";
import {
  listCampaigns,
  getCampaign,
  listItems,
  getItem,
  listEvidence,
  getEvidence,
  listPendingWrites,
  listAudit,
  generateAccessReviewEntityId,
} from "./store";
import {
  NATIVE_ACCESSREVIEW_CAMPAIGNS_KEY,
  NATIVE_ACCESSREVIEW_ITEMS_KEY,
  NATIVE_ACCESSREVIEW_EVIDENCE_KEY,
  NATIVE_ACCESSREVIEW_PENDING_KEY,
  NATIVE_ACCESSREVIEW_AUDIT_KEY,
  MAX_CAMPAIGNS_PER_TENANT,
  MAX_REVIEW_ITEMS_PER_CAMPAIGN,
  MAX_REVIEWERS_PER_CAMPAIGN,
  MAX_EVIDENCE_ENTRIES,
  MAX_PENDING_ACCESSREVIEW_WRITES,
  MAX_DAILY_ATTESTATIONS,
  MAX_DAILY_CAMPAIGN_OPENS,
} from "./types";
export {
  handleNativeAccessReviewAuthed,
  registerBuiltinNativeAccessReviewEventTypes,
  submitAccessReviewWrite,
  executePendingAccessReviewWrite,
  rejectAccessReviewWrite,
  noteOwnerDecision,
  publicCampaign,
  publicItem,
  publicEvidence,
  getActionName,
  listCampaigns,
  getCampaign,
  listItems,
  getItem,
  listEvidence,
  getEvidence,
  listPendingWrites,
  listAudit,
  generateAccessReviewEntityId,
  NATIVE_ACCESSREVIEW_CAMPAIGNS_KEY,
  NATIVE_ACCESSREVIEW_ITEMS_KEY,
  NATIVE_ACCESSREVIEW_EVIDENCE_KEY,
  NATIVE_ACCESSREVIEW_PENDING_KEY,
  NATIVE_ACCESSREVIEW_AUDIT_KEY,
  MAX_CAMPAIGNS_PER_TENANT,
  MAX_REVIEW_ITEMS_PER_CAMPAIGN,
  MAX_REVIEWERS_PER_CAMPAIGN,
  MAX_EVIDENCE_ENTRIES,
  MAX_PENDING_ACCESSREVIEW_WRITES,
  MAX_DAILY_ATTESTATIONS,
  MAX_DAILY_CAMPAIGN_OPENS,
};
export type { NativeAccessReviewCtx };