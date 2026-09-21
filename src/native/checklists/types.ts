/**
 * native/checklists/types.ts — Phase 2.3 native CHECKLISTS (quote-to-cash slice 3).
 *
 * Delivery checklist + task generation primitive over the Phase 1/2 stack:
 *   - records live in a tenant-keyed store (Phase 1.4 / 2.1 pattern),
 *   - every write rides the tenant Approval Queue (gated, verb-first actions),
 *   - item state changes are normalized with server-assigned cli_ ids (the
 *     client can never forge item ids), progress is computed from the items,
 *   - lifecycle emits typed native.checklist.* events (Phase 1.1 outbound),
 *   - immutable native.checklist.* audit on every mutation.
 *
 * Lifecycle (fail-closed transitions enforced in gate.ts):
 *   open → closed (owner closes the delivery checklist) — delete removes record.
 */
export type ChecklistItemStatus = "todo" | "in_progress" | "done";
export type ChecklistStatus = "open" | "closed";
export type ChecklistKind = "delivery" | "custom";

export interface ChecklistItem {
  id: string; // cli_<random> — never user-supplied
  title: string; // 1..MAX_ITEM_TITLE
  status: ChecklistItemStatus;
  assignee?: string; // optional email of the person responsible (≤ MAX_ASSIGNEE_EMAIL)
  completedAt?: string;
  completedBy?: string;
}

/** Raw item input — ids are assigned by validate.normalizeItems (stable). */
export interface ChecklistItemInput {
  id?: string; // MUST be an existing item id when present (forged ids → 400)
  title: string;
  status: ChecklistItemStatus;
  assignee?: string;
}

export interface ChecklistRecord {
  id: string; // chk_<random>
  tenantId: string;
  name: string; // 1..MAX_CHECKLIST_NAME
  description: string; // optional ("" when unset)
  kind: ChecklistKind;
  /** Optional link to the originating proposal (deal-close context, 2.4). */
  linkedProposalId: string | null;
  items: ChecklistItem[];
  status: ChecklistStatus;
  progress: { done: number; total: number }; // computed from items on every mutation
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  closedAt?: string;
  closedBy?: string;
}

/** Partial update payload — same shape as create minus name-required rule. */
export interface ChecklistMutation {
  name?: string;
  description?: string;
  kind?: ChecklistKind;
  linkedProposalId?: string | null;
  items?: ChecklistItemInput[];
}

/**
 * Gated-write ops. ACTION NAMES are verb-first (createChecklist/updateChecklist/
 * closeChecklist/deleteChecklist) so the Approval Queue isWriteAction classifies
 * them as writes — same rule as proposals 2.1 (never a verb-last name).
 */
export type ChecklistOp = "create" | "update" | "close" | "delete";

export interface PendingChecklistWrite {
  id: string; // clw_<random>
  tenantId: string;
  checklistId: string | null; // null for create (record not yet inserted)
  op: ChecklistOp;
  payload: {
    data?: ChecklistMutation;
    via?: string; // "portal"
  };
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { status: ChecklistStatus; checklistId: string };
  appliedAt?: string;
  appliedBy?: string;
  error?: string;
}

// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_CHECKLISTS_PER_TENANT = 50;
export const MAX_CHECKLIST_ITEMS = 50;
export const MAX_CHECKLIST_NAME = 200;
export const MAX_CHECKLIST_DESC = 2000;
export const MAX_ITEM_TITLE = 200;
export const MAX_ASSIGNEE_EMAIL = 200;
export const MAX_PENDING_CHECKLIST_WRITES = 50;

// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_CHECKLISTS_KEY = "native_checklists.json";
export const NATIVE_CHECKLISTS_AUDIT_KEY = "native_checklists_audit.json";