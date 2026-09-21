/**
 * native/dealroom/types.ts — Phase 2.4 native DEAL ROOM (quote-to-cash slice 4).
 *
 * A per-deal document room that ties the proposal lifecycle together. It is the
 * single per-customer surface where the approved+signed proposal PDF (Phase 1.2
 * add-only doc history, via the linked proposal), the delivery checklist
 * progress (Phase 2.3), and deal metadata live. This module NEVER duplicates
 * blobs — the proposal PDF is read from the linked proposal's docId and the
 * checklist progress is read from the linked checklist record (derived,
 * read-only references only).
 *
 * Discipline (mirrors P2.1/P2.2/P2.3 exactly):
 *   - tenant-keyed store + durable pending-write mirror + immutable
 *     native.dealroom.* audit on every mutation,
 *   - server-assigned ids (dea_…) — forged id on create → 400 BEFORE any
 *     normalization (rejectRawIds pattern from checklists); unknown id on
 *     update/refs → 400,
 *   - linked proposal/checklist ids are VALIDATED to exist in the tenant
 *     before any mutation is queued (fail-closed refs),
 *   - every write rides the Approval Queue (verb-first action names
 *     createDealRoom/updateDealRoom/archiveDealRoom/deleteDealRoom),
 *   - status lifecycle draft → active → archived (fail-closed transitions),
 *   - a randomized unguessable share slug (global index → tenant only) gives
 *     the customer a READ-ONLY view (no writes on the public path).
 */
export type DealRoomStatus = "draft" | "active" | "archived";

export interface DealRoomRecord {
  id: string; // dea_<random> — server-assigned
  tenantId: string;
  name: string; // 1..MAX_DEAL_ROOM_NAME
  customerName: string; // 1..MAX_CUSTOMER_NAME
  customerEmail: string; // validated email (≤ MAX_CUSTOMER_EMAIL)
  description: string; // optional ("" when unset), ≤ MAX_DEAL_ROOM_DESC
  /** Linked proposal — MUST exist in the tenant's proposals (validated). */
  linkedProposalId: string; // prop_<random>
  /** Optional linked delivery checklist — must exist in the tenant (validated). */
  linkedChecklistId: string | null; // chk_<random> | null
  status: DealRoomStatus;
  /** Randomized public share slug (global index, slug→tenant only). */
  shareSlug: string | null;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt?: string;
  archivedBy?: string;
}

/** Partial update payload — same shape as create minus name-required rule. */
export interface DealRoomMutation {
  name?: string;
  customerName?: string;
  customerEmail?: string;
  description?: string;
  linkedProposalId?: string | null;
  linkedChecklistId?: string | null;
  /** Optional status carried by update (draft↔active only; see gate). */
  status?: DealRoomStatus;
}

/**
 * Gated-write ops. ACTION NAMES are verb-first (createDealRoom/updateDealRoom/
 * archiveDealRoom/deleteDealRoom) so the Approval Queue isWriteAction
 * classifies them as writes — same rule as 2.1/2.3 (never a verb-last name).
 */
export type DealRoomOp = "create" | "update" | "archive" | "delete";

export interface PendingDealRoomWrite {
  id: string; // dlw_<random>
  tenantId: string;
  dealRoomId: string | null; // null for create (record not yet inserted)
  op: DealRoomOp;
  payload: {
    data?: DealRoomMutation;
    via?: string; // "portal"
  };
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { status: DealRoomStatus; dealRoomId: string };
  appliedAt?: string;
  appliedBy?: string;
  error?: string;
}

// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_DEAL_ROOMS_PER_TENANT = 50;
export const MAX_DEAL_ROOM_NAME = 200;
export const MAX_CUSTOMER_NAME = 200;
export const MAX_CUSTOMER_EMAIL = 200;
export const MAX_DEAL_ROOM_DESC = 2000;
export const MAX_PENDING_DEAL_ROOM_WRITES = 50;

// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_DEALROOMS_KEY = "native_dealrooms.json";
export const NATIVE_DEALROOMS_AUDIT_KEY = "native_dealrooms_audit.json";
export const NATIVE_DEALROOM_SLUGS_KEY = "native_dealroom_slugs.json";