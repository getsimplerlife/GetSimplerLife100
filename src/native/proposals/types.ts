/**
 * native/proposals/types.ts — Phase 2.1 native PROPOSALS (quote-to-cash slice 1).
 *
 * Proposal object model over the Phase 1 primitives:
 *   - records live in a tenant-keyed store (Phase 1.4 pattern),
 *   - generated PDFs live in the document store (Phase 1.2) — kind "proposal"
 *     (already in DOC_KINDS), add-only versioned,
 *   - lifecycle emits typed native.proposal.* events (Phase 1.1 outbound),
 *   - the client decision rides the tenant Approval Queue (Phase 1.4 gate).
 *
 * Lifecycle (fail-closed transitions enforced in gate.ts):
 *   draft → pending ("open for client review" — share link + PDF generated)
 *         → approved | rejected (client decision via share link OR owner record)
 *   approved → sent (final PDF generated + filed; no e-sign yet — Phase 2.2).
 */
export type ProposalStatus = "draft" | "pending" | "approved" | "rejected" | "sent";

export interface ProposalLineItem {
  id: string; // li_<random> — never user-supplied
  description: string;
  qty: number; // > 0, ≤ 2 decimals
  unitPrice: number; // ≥ 0, ≤ 2 decimals (currency minor-unit discipline)
}

/** Raw line-item input — ids are assigned by validate.normalizeLineItems. */
export interface ProposalLineItemInput {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface ProposalRecord {
  id: string; // prop_<random>
  tenantId: string;
  title: string;
  clientName: string;
  clientEmail: string; // optional ("" when unset)
  clientCompany: string; // optional
  lineItems: ProposalLineItem[];
  currency: string; // ISO 4217 3-letter uppercase
  terms: string; // payment terms text (optional, "" when unset)
  validityDays: number;
  status: ProposalStatus;
  /** Randomized share slug (global index, slug→tenant only) — set by openProposal. */
  shareSlug: string | null;
  /** Latest generated PDF as a native document record (Phase 1.2 store). */
  docId: string | null;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  sentAt?: string;
  sentBy?: string;
}

/** Partial update payload — same shape as create minus status (status is op-driven). */
export interface ProposalMutation {
  title?: string;
  clientName?: string;
  clientEmail?: string;
  clientCompany?: string;
  lineItems?: ProposalLineItemInput[];
  currency?: string;
  terms?: string;
  validityDays?: number;
}

/**
 * Gated-write ops. ACTION NAMES stay verb-first (createProposal/updateProposal/
 * openProposal/approveProposal/rejectProposal/sendProposal/deleteProposal) so the
 * Approval Queue isWriteAction classifies them as writes (verb-first rule, 1.4).
 * NOTE: "share" is deliberately NOT used as an action verb — it is absent from
 * WRITE_VERB in approval-queue.ts and would silently BYPASS the gate (fail-open).
 */
export type ProposalOp = "create" | "update" | "open" | "approve" | "reject" | "send" | "delete";

export interface PendingProposalWrite {
  id: string; // ppw_<random>
  tenantId: string;
  proposalId: string | null; // null for create (record not yet inserted)
  op: ProposalOp;
  /** Snapshot of the write intent (validated before gating). */
  payload: {
    data?: ProposalMutation;
    via?: string; // "portal" | "client-decision"
    signerName?: string;
  };
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { status: ProposalStatus; proposalId: string; docId?: string | null };
  appliedAt?: string;
  appliedBy?: string;
  error?: string;
}

// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_PROPOSALS_PER_TENANT = 50;
export const MAX_LINE_ITEMS = 50;
export const MAX_TITLE_LENGTH = 120;
export const MAX_CLIENT_NAME = 120;
export const MAX_CLIENT_EMAIL = 200;
export const MAX_CLIENT_COMPANY = 200;
export const MAX_TERMS_LENGTH = 4000;
export const MAX_CURRENCY_LEN = 3;
export const MIN_VALIDITY_DAYS = 1;
export const MAX_VALIDITY_DAYS = 365;
export const MAX_UNIT_PRICE = 1_000_000_000;
export const MAX_QTY = 1_000_000;
export const MAX_PENDING_PROPOSAL_WRITES = 50;
export const PROPOSAL_DOC_BUCKET = "proposals";
export const MAX_SIGNER_NAME = 120;

// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_PROPOSALS_KEY = "native_proposals.json";
export const NATIVE_PROPOSALS_AUDIT_KEY = "native_proposals_audit.json";
export const NATIVE_PROPOSAL_SLUGS_KEY = "native_proposal_slugs.json";