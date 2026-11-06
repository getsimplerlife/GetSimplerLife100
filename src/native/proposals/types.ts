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

/**
 * SLICE 192b — THE PUBLISH RULE, in one place.
 *
 * The share slug is minted by `open` (draft → pending) and by `revokeShare`;
 * a draft has no slug at all. The rule below is what a PUBLIC reader is
 * allowed to see, and it is consumed by BOTH lanes that can hand a proposal to
 * a client: the proposal share GET and the deal-room share view. Before this
 * existed the deal room served a linked proposal's title, status and total with
 * no status filter, so an active room printed a draft quote's amount to the
 * customer — the exact state the proposal lane itself refuses to serve.
 *
 * Typed `Record<ProposalStatus, boolean>` on purpose — a new status is a
 * compile error here rather than a silently-public page (the same discipline as
 * `PUBLIC_INVOICE_STATUS` in the invoice router and `PUBLIC_DEAL_ROOM_STATUS`).
 */
export const PUBLIC_PROPOSAL_STATUS: Record<ProposalStatus, boolean> = {
  draft: false, // never issued: no slug, no PDF, nothing left the building
  pending: true, // opened for client review — the link the client holds
  approved: true, // the client decided; the quote they signed stays readable
  rejected: true, // same record, honest verdict — not a secret
  sent: true, // final PDF filed and emailed; the record still exists
};

/** True when a public lane may serve a proposal in this state. */
export function isProposalPubliclyShareable(status: ProposalStatus): boolean {
  return PUBLIC_PROPOSAL_STATUS[status] === true;
}

/**
 * SLICE 192b — the validity window, computed rather than printed.
 *
 * `validityDays` was stored and rendered ("Valid for 30 days") but nothing
 * derived from it: `grep -i expire` over src/** returned zero matches, so a
 * quote stayed signable forever. `expiresAt` is set by `open` from the day the
 * quote was ISSUED (not the day the row was created) plus `validityDays`.
 */
export function computeProposalExpiry(issuedAt: string, validityDays: number): string {
  const from = Date.parse(issuedAt);
  const days = Number.isFinite(validityDays) && validityDays > 0 ? validityDays : 0;
  return new Date((Number.isFinite(from) ? from : Date.now()) + days * 86_400_000).toISOString();
}

/**
 * True when this proposal's validity window has closed. ONE definition, used by
 * the share GET (what the client is shown), the decision POST (what the server
 * refuses) and the deal-room view.
 *
 * Fail-closed on an unreadable date: a record that claims an expiry we cannot
 * parse is not a licence to keep signing. A record with NO expiry claim (a
 * draft, or one written before this slice) is not "expired" — it is simply not
 * claiming a window, and the draft gate above is what keeps it unpublished.
 */
export function isProposalExpired(record: { expiresAt?: string | null }, now: number | string | Date = Date.now()): boolean {
  const claim = record.expiresAt;
  if (typeof claim !== "string" || claim.length === 0) return false;
  const at = Date.parse(claim);
  if (!Number.isFinite(at)) return true;
  const at2 = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (!Number.isFinite(at2)) return true;
  return at2 >= at;
}

/**
 * The proposal content a signature binds. Hashed together with the signature
 * fields so that "who signed" and "what they signed" are one fingerprint.
 */
export interface ProposalSignedContent {
  title: string;
  currency: string;
  lineItems: { description: string; qty: number; unitPrice: number }[];
  terms: string;
  version: number;
}

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
  /**
   * SLICE 195a — THE CLIENT THIS QUOTE IS FOR, as an id in the tenant's own
   * client store. Required on create and validated server-side against that
   * store (`lib/client-store.ts`), never trusted from the body.
   *
   * OPTIONAL IN THE TYPE, AND THAT IS THE HONEST MODEL: every proposal written
   * before this slice has no such field on disk, and those rows must keep
   * reading. They render as "Unassigned" (lib/client-ref.ts) — never guessed at
   * from `clientName`, never rewritten, never deleted.
   */
  clientId?: string;
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
  /**
   * SLICE 192b — the instant this proposal was ISSUED to the client, i.e. the
   * `open` transition that minted the share slug. Set only by `open`; the page
   * must print "Issued" from THIS, never from `createdAt` (191's
   * `issuedAtSource` fix, applied here).
   */
  issuedAt?: string;
  /** SLICE 192b — `issuedAt` + `validityDays`. Computed, never hand-set. */
  expiresAt?: string;
  /**
   * SLICE 192b — the content `version` the most recent signature was captured
   * against. Mirrors `ProposalSignature.signedVersion` for the latest signature
   * so a reader can compare it with `version` at a glance; the per-signature
   * field is the authoritative one (a proposal can carry several signatures).
   */
  signedVersion?: number;
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
  /**
   * SLICE 176 — the outcome of the LAST attempt to email this proposal.
   * `sentAt`/`sentBy` are set ONLY when the provider acknowledged the message;
   * this field records every attempt (including a refusal) so the portal can
   * say what actually happened instead of guessing from the status.
   */
  lastDeliveryAttempt?: ProposalDeliveryAttempt;
  /** E-signatures captured on acceptance (Phase 2.2) — appended by the gated apply executor only. */
  signatures: ProposalSignature[];
}

/**
 * One attempt to hand the proposal to the mail lane. `outcome` is the lane's
 * own answer — "sent" only on a provider acknowledgement, "unconfigured" when
 * no lane exists (nothing was dispatched at all).
 */
export interface ProposalDeliveryAttempt {
  at: string;
  by: string;
  channel: "sendgrid" | "smtp" | "none";
  outcome: "sent" | "failed" | "unconfigured";
  /** Provider message id — present ONLY on an acknowledged send. */
  messageId?: string;
  /** The lane's refusal reason — present on every non-sent outcome. */
  error?: string;
}

/**
 * A captured e-signature (Phase 2.2). At least one of initials/drawnDataUrl is
 * set (signatureType decides which).
 *
 * SLICE 192b — `payloadHash` used to be sha256 over the SIGNATURE FIELDS ONLY
 * ({signerName, signatureType, initials, drawnDataUrl}), so the amount the
 * client agreed to was bound to nothing: the record could be edited afterwards
 * and the audit trail could not tell. It is now sha256 over the canonical JSON
 * of the signed CONTENT ({title, currency, lineItems, terms, version}) together
 * with those signature fields — see `signaturePayloadHash` in validate.ts.
 * `signedVersion` records which content version that hash was taken from.
 */
export interface ProposalSignature {
  id: string; // sig_<random> — never user-supplied
  signerName: string; // typed full name (1..MAX_SIGNER_NAME)
  signatureType: "typed" | "drawn";
  initials?: string; // typed initials (1..MAX_INITIALS_LENGTH) when typed
  drawnDataUrl?: string; // data:image/png;base64,… when drawn (magic-byte checked)
  /** sha256 hex over the signed content + the signature fields. */
  payloadHash: string;
  /** SLICE 192b — the record `version` this signature was captured against. */
  signedVersion: number;
  capturedAt: string;
}

/** Signature input from the share page — validated BEFORE the gate. */
export interface ProposalSignatureInput {
  signerName: string;
  signatureType: "typed" | "drawn";
  initials?: string;
  drawnDataUrl?: string;
  payloadHash: string;
  /** SLICE 192b — set by validateSignatureInput from the signed content. */
  signedVersion: number;
}

/** Partial update payload — same shape as create minus status (status is op-driven). */
export interface ProposalMutation {
  title?: string;
  /**
   * SLICE 195a — the client this quote is for. Required on create; on update it
   * may only be set to another client of THIS tenant (the gate checks it
   * against the client store either way).
   */
  clientId?: string;
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
 *
 * SLICE 192b — `revokeShare` is an ACTION ON THE SLUG, not a lifecycle state
 * (the same rule 192a gave deal rooms): it retires the current public slug and
 * mints a fresh one, so the link the client holds stops resolving while the
 * record — and its status — survive. Before this, `delete` was the only way to
 * kill a link, and it destroyed the record.
 */
export type ProposalOp = "create" | "update" | "open" | "approve" | "reject" | "send" | "delete" | "revokeShare";

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
    signature?: ProposalSignatureInput;
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
export const MAX_INITIALS_LENGTH = 16;
export const MAX_DRAWN_SIGNATURE_BYTES = 131_072; // 128 KiB decoded PNG
export const MAX_SIGNATURES_PER_PROPOSAL = 5;

// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_PROPOSALS_KEY = "native_proposals.json";
export const NATIVE_PROPOSALS_AUDIT_KEY = "native_proposals_audit.json";
export const NATIVE_PROPOSAL_SLUGS_KEY = "native_proposal_slugs.json";