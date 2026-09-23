/**
 * native/board/types.ts — Phase 3.2 native TASK/PROJECT BOARDS
 * (tenant-keyed kanban boards, columns, cards; gated writes via the
 * Approval Queue; LLM-free).
 *
 * Discipline (mirrors P2.1–P3.1 exactly):
 *   - tenant-keyed store + durable pending-write mirror + immutable
 *     native.board.* audit on every mutation,
 *   - server-assigned ids (brd_/col_/crd_/bdw_…) — forged id on create → 400
 *     BEFORE any normalization (raw-body reject in the router); unknown id on
 *     ops → 404 fail-closed (no IDOR, cross-tenant tested),
 *   - validation happens BEFORE the gate (a never-valid write never queues),
 *   - every write rides the Approval Queue with VERB-FIRST action names
 *     (createBoard/updateBoard/moveBoardCard/assignBoardCard/archiveBoard/
 *     closeBoardCard/reopenBoardCard/deleteBoardCard/…) so isWriteAction
 *     classifies them as writes (P2.5 generate + P3.1 publish/confirm/request
 *     fail-open lessons — EVERY board verb is listed in WRITE_VERB; the
 *     classification test asserts EACH action name, and `reopen` was ADDED to
 *     WRITE_VERB because it was missing),
 *   - lifecycle: board active → archived (terminal); card open → closed → open
 *     (close/reopen reversible, move/assign only while open); delete is
 *     exact-id only (a board delete removes its cards; a column delete is
 *     blocked while the column still has cards),
 *   - autonomy (#236): allow-listed entries auto-apply with
 *     recordAutonomyOutcome; destructive ops (delete/archive) need exact ids.
 */
export type BoardStatus = "active" | "archived";
export type BoardCardStatus = "open" | "closed";

/** One kanban column on a board (order = position within the board). */
export interface BoardColumn {
  id: string; // col_<random> — server-assigned
  name: string; // 1..MAX_BOARD_COLUMN_NAME
  position: number; // 0-based display order
  createdAt: string;
  createdBy: string;
}

/** A task/project board (the tenant's kanban). */
export interface BoardRecord {
  id: string; // brd_<random> — server-assigned
  tenantId: string;
  name: string; // 1..MAX_BOARD_NAME
  description: string; // ≤ MAX_BOARD_DESC ("")
  columns: BoardColumn[]; // ≤ MAX_COLUMNS_PER_BOARD
  status: BoardStatus;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt?: string;
  archivedBy?: string;
}

/** One card on a board, positioned inside a column. */
export interface BoardCardRecord {
  id: string; // crd_<random> — server-assigned
  tenantId: string;
  boardId: string; // brd_ — must exist in-tenant
  columnId: string; // col_ — must belong to the board
  title: string; // 1..MAX_BOARD_CARD_TITLE
  description: string; // ≤ MAX_BOARD_CARD_DESC
  assignee: string | null; // owner email or null (unassigned)
  position: number; // 0-based order within the column
  status: BoardCardStatus; // open → closed → open (reopen allowed)
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  closedAt?: string;
  closedBy?: string;
  reopenedAt?: string;
}

/** Board mutation (create/update). */
export interface BoardMutation {
  name?: string;
  description?: string;
}

/** Column mutation (create/update). */
export interface BoardColumnMutation {
  name: string;
}

/** Card mutation (create/update). */
export interface BoardCardMutation {
  title?: string;
  description?: string;
  columnId?: string;
  assignee?: string | null;
}

export interface BoardMoveInput {
  columnId?: string;
  position?: number;
}

export interface BoardAssignInput {
  assignee?: string | null;
}

/**
 * Gated-write ops. ACTION NAMES are verb-first and each verb used here MUST be
 * classified as a WRITE by approval-queue.isWriteAction (WRITE_VERB). The P2.5
 * generate + P3.1 publish/confirm/request lessons: every board verb is either
 * already in WRITE_VERB or was ADDED to it (`reopen`), and the classification
 * test asserts each action name (createBoard/updateBoard/moveBoardCard/…).
 */
export type BoardOp =
  | "create" // createBoard
  | "update" // updateBoard
  | "archive" // archiveBoard (terminal)
  | "delete" // deleteBoard (exact-id; removes its cards)
  | "createColumn" // createBoardColumn
  | "updateColumn" // updateBoardColumn
  | "deleteColumn" // deleteBoardColumn (blocked while cards remain)
  | "createCard" // createBoardCard
  | "updateCard" // updateBoardCard
  | "move" // moveBoardCard
  | "assign" // assignBoardCard
  | "close" // closeBoardCard
  | "reopen" // reopenBoardCard
  | "deleteCard"; // deleteBoardCard

export interface PendingBoardWrite {
  id: string; // bdw_<random>
  tenantId: string;
  boardId: string | null; // null for create
  columnId: string | null; // for createCard / move
  cardId: string | null; // null for board/column ops
  op: BoardOp;
  payload: {
    data?: BoardMutation;
    column?: BoardColumnMutation;
    card?: BoardCardMutation;
    move?: BoardMoveInput;
    assign?: BoardAssignInput;
    via?: string;
  };
  status: "pending" | "applied" | "rejected";
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
  appliedResult?: { status: string; boardId?: string; columnId?: string; cardId?: string };
  appliedAt?: string;
  appliedBy?: string;
  error?: string;
}

// ── Caps (fail-closed) ──────────────────────────────────────────────────────
export const MAX_BOARDS_PER_TENANT = 25;
export const MAX_COLUMNS_PER_BOARD = 12;
export const MAX_CARDS_PER_BOARD = 500;
export const MAX_PENDING_BOARD_WRITES = 50;
export const MAX_BOARD_NAME = 200;
export const MAX_BOARD_DESC = 2000;
export const MAX_BOARD_COLUMN_NAME = 100;
export const MAX_BOARD_CARD_TITLE = 300;
export const MAX_BOARD_CARD_DESC = 4000;
export const MAX_BOARD_ASSIGNEE = 200;

// ── Store keys ──────────────────────────────────────────────────────────────
export const NATIVE_BOARDS_KEY = "native_boards.json";
export const NATIVE_BOARDS_AUDIT_KEY = "native_boards_audit.json";