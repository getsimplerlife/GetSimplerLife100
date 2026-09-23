/**
 * native/board/gate.ts — GATED WRITE PATH for native task/project boards (Phase 3.2).
 *
 * Mirrors the Phase 2.1–3.1 gates exactly:
 *   - validation happens BEFORE the gate (a never-valid write never queues),
 *   - every write action rides the Approval Queue by default via
 *     approvalGate(tenantId, actionName, "native-boards", params, …),
 *   - autonomy (#236): allow-listed entries auto-apply with
 *     recordAutonomyOutcome; globs can NEVER auto-delete/archive (destructive
 *     ops need exact ids),
 *   - a durable pending-write mirror lands with each approval card (tenant
 *     record untouched until apply) and the approve-path executor applies
 *     idempotently (replay → alreadyApplied),
 *   - every apply appends an immutable native.board.* audit entry + a typed
 *     webhook event (Phase 1.1 registry),
 *   - ACTION NAMES ARE VERB-FIRST AND EVERY VERB IS IN WRITE_VERB — the
 *     P2.5 `generate` + P3.1 `publish/confirm/request` fail-open lessons:
 *     `reopen` was MISSING from WRITE_VERB and is ADDED here (reopenBoardCard
 *     would otherwise have bypassed the Approval Queue as a READ); the
 *     classification test asserts EACH board action name,
 *   - lifecycle: board active → archived (terminal); card open → closed → open
 *     (reopen allowed); delete is exact-id only; a column delete is blocked
 *     while it still contains cards (fail-closed).
 */
import { approvalGate, markApproved, markRejected } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  MAX_CARDS_PER_BOARD,
  MAX_PENDING_BOARD_WRITES,
  type BoardCardMutation,
  type BoardCardRecord,
  type BoardMutation,
  type BoardOp,
  type BoardRecord,
  type PendingBoardWrite,
} from "./types";
import {
  addColumn,
  appendAudit,
  applyBoardMutation,
  applyCardMutation,
  countCardsForBoard,
  generateBoardEntityId,
  getBoard,
  getCard,
  getColumn,
  insertBoard,
  insertCard,
  listCardsForBoard,
  listPendingWrites,
  markPendingWrite,
  nextPositionInColumn,
  removeBoard,
  removeCard,
  removeColumn,
  savePendingWrite,
  updateColumn,
} from "./store";
import {
  boardMutationFromInput,
  cardMutationFromInput,
  isBoardId,
  isCardId,
  isColumnId,
  validateBoardMutation,
  validateCardMutation,
  validateColumnMutation,
} from "./validate";

export type BoardWriteRequest = {
  boardId?: string; // null for create
  columnId?: string;
  cardId?: string;
  data?: BoardMutation;
  column?: { name: string };
  card?: BoardCardMutation;
  move?: { columnId?: string; position?: number };
  assign?: { assignee?: string | null };
  via?: string;
};

export type BoardWriteResult =
  | { applied: true; pending: false; board?: BoardRecord; card?: BoardCardRecord; op: BoardOp; autonomy: boolean; actionId?: string }
  | { applied: false; pending: true; approvalActionId: string; op: BoardOp }
  | { applied: false; pending: false; error: string };

/** ACTION NAMES are verb-first AND each verb is in WRITE_VERB (fail-open guard). */
const ACTION_NAME: Record<BoardOp, string> = {
  create: "createBoard",
  update: "updateBoard",
  archive: "archiveBoard",
  delete: "deleteBoard",
  createColumn: "createBoardColumn",
  updateColumn: "updateBoardColumn",
  deleteColumn: "deleteBoardColumn",
  createCard: "createBoardCard",
  updateCard: "updateBoardCard",
  move: "moveBoardCard",
  assign: "assignBoardCard",
  close: "closeBoardCard",
  reopen: "reopenBoardCard",
  deleteCard: "deleteBoardCard",
};

function isBoardTerminal(status: BoardRecord["status"]): boolean {
  return status === "archived";
}

/**
 * Validate the write BEFORE it reaches the queue. Throws on failure (caller
 * turns it into a 400). Reflects P2.x discipline: linked ids must EXIST IN THE
 * TENANT; lifecycle transitions are state-checked here (a closed card can be
 * reopened; an open card can be closed; only open cards move/assign; only open
 * boards mutate).
 */
function validateWrite(dataDir: string, tenantId: string, op: BoardOp, req: BoardWriteRequest, opts?: { rejectRawIds?: boolean }): void {
  const board = (): BoardRecord => {
    if (!req.boardId) throw new Error("boardId is required");
    if (!isBoardId(req.boardId)) throw new Error("invalid boardId");
    const b = getBoard(dataDir, tenantId, req.boardId);
    if (!b) throw new Error("board not found"); // 404-no-IDOR shape
    return b;
  };
  const card = (): BoardCardRecord => {
    if (!req.cardId) throw new Error("cardId is required");
    if (!isCardId(req.cardId)) throw new Error("invalid cardId");
    const c = getCard(dataDir, tenantId, req.cardId);
    if (!c) throw new Error("card not found");
    return c;
  };
  if (opts?.rejectRawIds) {
    // Forged server-side ids on create → 400 BEFORE any normalization.
    if (req.boardId && isBoardId(req.boardId)) throw new Error("boardId must not be provided on create");
    if (req.columnId && isColumnId(req.columnId)) throw new Error("columnId must not be provided on create");
    if (req.cardId && isCardId(req.cardId)) throw new Error("cardId must not be provided on create");
  }
  if (op === "create") {
    if (!req.data) throw new Error("board data is required");
    if (!req.data.name) throw new Error("name is required");
    const v = validateBoardMutation(req.data);
    if (!v.ok) throw new Error(v.error);
    return;
  }
  if (op === "update") {
    const b = board();
    if (isBoardTerminal(b.status)) throw new Error("board is archived");
    if (!req.data || Object.keys(req.data).length === 0) throw new Error("board data is required");
    const v = validateBoardMutation(req.data);
    if (!v.ok) throw new Error(v.error);
    return;
  }
  if (op === "archive" || op === "delete") {
    const b = board();
    if (op === "archive" && isBoardTerminal(b.status)) throw new Error("board is already archived");
    return;
  }
  if (op === "createColumn") {
    const b = board();
    if (isBoardTerminal(b.status)) throw new Error("board is archived");
    if (!req.column || !req.column.name) throw new Error("column name is required");
    const v = validateColumnMutation({ name: req.column.name });
    if (!v.ok) throw new Error(v.error);
    return;
  }
  if (op === "updateColumn") {
    const b = board();
    if (isBoardTerminal(b.status)) throw new Error("board is archived");
    if (!req.boardId || !req.columnId) throw new Error("boardId and columnId are required");
    if (!isColumnId(req.columnId)) throw new Error("invalid columnId");
    if (!getColumn(dataDir, tenantId, req.boardId, req.columnId)) throw new Error("column not found");
    if (!req.column || !req.column.name) throw new Error("column name is required");
    const v = validateColumnMutation({ name: req.column.name });
    if (!v.ok) throw new Error(v.error);
    return;
  }
  if (op === "deleteColumn") {
    const b = board();
    if (!req.boardId || !req.columnId) throw new Error("boardId and columnId are required");
    if (!isColumnId(req.columnId)) throw new Error("invalid columnId");
    if (!getColumn(dataDir, tenantId, req.boardId, req.columnId)) throw new Error("column not found");
    void b;
    return; // cards-in-column check happens in the store executor (needs listCards)
  }
  if (op === "createCard") {
    const b = board();
    if (isBoardTerminal(b.status)) throw new Error("board is archived");
    if (!req.columnId) throw new Error("columnId is required");
    if (!isColumnId(req.columnId)) throw new Error("invalid columnId");
    if (!getColumn(dataDir, tenantId, b.id, req.columnId)) throw new Error("column not found");
    if (countCardsForBoard(dataDir, tenantId, b.id) >= MAX_CARDS_PER_BOARD) {
      throw new Error(`Card cap reached for this board (${MAX_CARDS_PER_BOARD})`);
    }
    if (!req.card || !req.card.title) throw new Error("card title is required");
    const v = validateCardMutation({ title: req.card.title, description: req.card.description, assignee: req.card.assignee });
    if (!v.ok) throw new Error(v.error);
    return;
  }
  if (op === "updateCard" || op === "move" || op === "assign" || op === "close" || op === "reopen" || op === "deleteCard") {
    const c = card();
    const b = getBoard(dataDir, tenantId, c.boardId);
    if (!b) throw new Error("board not found");
    if (isBoardTerminal(b.status)) throw new Error("board is archived"); // archived boards are frozen
    if (op === "updateCard") {
      if (!req.card || Object.keys(req.card).length === 0) throw new Error("card data is required");
      const v = validateCardMutation(req.card);
      if (!v.ok) throw new Error(v.error);
      if (req.card.columnId !== undefined) {
        if (!isColumnId(req.card.columnId)) throw new Error("invalid columnId");
        if (!getColumn(dataDir, tenantId, c.boardId, req.card.columnId)) throw new Error("column not found");
      }
      return;
    }
    if (op === "move") {
      if (c.status !== "open") throw new Error("only open cards can be moved");
      if (req.move && req.move.columnId !== undefined) {
        if (!isColumnId(req.move.columnId)) throw new Error("invalid columnId");
        if (!getColumn(dataDir, tenantId, c.boardId, req.move.columnId)) throw new Error("column not found");
      }
      if (!req.move || (req.move.columnId === undefined && req.move.position === undefined)) throw new Error("move requires columnId or position");
      return;
    }
    if (op === "assign") {
      if (c.status !== "open") throw new Error("only open cards can be assigned");
      if (req.assign && req.assign.assignee !== undefined && req.assign.assignee !== null) {
        const a = typeof req.assign.assignee === "string" ? req.assign.assignee.trim() : "";
        if (a.length < 1 || a.length > 254) throw new Error("assignee must be null or a non-empty email string");
      }
      return;
    }
    if (op === "close" && c.status !== "open") throw new Error(`only open cards can be closed (current: ${c.status})`);
    if (op === "reopen" && c.status !== "closed") throw new Error(`only closed cards can be reopened (current: ${c.status})`);
    return;
  }
  throw new Error(`unknown board op: ${op}`);
}

type AppliedOp =
  | { kind: "board"; board: BoardRecord }
  | { kind: "card"; card: BoardCardRecord };

function applyMutation(dataDir: string, tenantId: string, op: BoardOp, req: BoardWriteRequest, actor: string): AppliedOp {
  const now = new Date().toISOString();
  if (op === "create") {
    const record: BoardRecord = {
      id: generateBoardEntityId("brd"),
      tenantId,
      name: req.data!.name!.trim(),
      description: req.data!.description ?? "",
      columns: [],
      status: "active",
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    insertBoard(dataDir, record); // throws at cap — never silently truncates
    appendAudit(dataDir, { tenantId, actor, action: "native.board.created", boardId: record.id, detail: `Created board "${record.name}"` });
    publishEvent(dataDir, tenantId, "native.board.created", { boardId: record.id, name: record.name, status: "active" });
    return { kind: "board", board: record };
  }
  if (op === "archive" || op === "update") {
    const b = getBoard(dataDir, tenantId, req.boardId!)!;
    const nextStatus = op === "archive" ? "archived" : null;
    const record = applyBoardMutation(dataDir, tenantId, b.id, req.data ?? {}, nextStatus, actor)!;
    const auditAction = op === "archive" ? "native.board.archived" : "native.board.updated";
    appendAudit(dataDir, { tenantId, actor, action: auditAction, boardId: record.id, detail: `${op === "archive" ? "Archived" : "Updated"} board "${record.name}" → ${record.status}` });
    publishEvent(dataDir, tenantId, auditAction, { boardId: record.id, name: record.name, status: record.status, changed: op === "update" ? Object.keys(req.data ?? {}) : undefined });
    return { kind: "board", board: record };
  }
  if (op === "delete") {
    const b = getBoard(dataDir, tenantId, req.boardId!)!;
    appendAudit(dataDir, { tenantId, actor, action: "native.board.deleted", boardId: b.id, detail: `Deleted board "${b.name}" (${listCardsForBoard(dataDir, tenantId, b.id).length} cards)` });
    removeBoard(dataDir, tenantId, b.id);
    publishEvent(dataDir, tenantId, "native.board.deleted", { boardId: b.id, name: b.name });
    return { kind: "board", board: { ...b, status: "deleted" as unknown as BoardRecord["status"] } };
  }
  if (op === "createColumn") {
    const b = getBoard(dataDir, tenantId, req.boardId!)!;
    const column = { id: generateBoardEntityId("col"), name: req.column!.name.trim(), position: b.columns.length, createdAt: now, createdBy: actor };
    const record = addColumn(dataDir, tenantId, b.id, column)!;
    appendAudit(dataDir, { tenantId, actor, action: "native.board.column.created", boardId: record.id, columnId: column.id, detail: `Added column "${column.name}"` });
    publishEvent(dataDir, tenantId, "native.board.column.created", { boardId: record.id, columnId: column.id, name: column.name });
    return { kind: "board", board: record };
  }
  if (op === "updateColumn") {
    const b = getBoard(dataDir, tenantId, req.boardId!)!;
    const record = updateColumn(dataDir, tenantId, b.id, req.columnId!, { name: req.column!.name }, actor)!;
    appendAudit(dataDir, { tenantId, actor, action: "native.board.column.updated", boardId: record.id, columnId: req.columnId, detail: `Renamed column to "${req.column!.name.trim()}"` });
    publishEvent(dataDir, tenantId, "native.board.column.updated", { boardId: record.id, columnId: req.columnId, name: req.column!.name.trim() });
    return { kind: "board", board: record };
  }
  if (op === "deleteColumn") {
    const b = getBoard(dataDir, tenantId, req.boardId!)!;
    const record = removeColumn(dataDir, tenantId, b.id, req.columnId!)!; // throws while cards remain
    appendAudit(dataDir, { tenantId, actor, action: "native.board.column.deleted", boardId: record.id, columnId: req.columnId, detail: "Deleted column" });
    publishEvent(dataDir, tenantId, "native.board.column.deleted", { boardId: record.id, columnId: req.columnId });
    return { kind: "board", board: record };
  }
  if (op === "createCard") {
    const c: BoardCardRecord = {
      id: generateBoardEntityId("crd"),
      tenantId,
      boardId: req.boardId!,
      columnId: req.columnId!,
      title: req.card!.title!.trim(),
      description: req.card!.description ?? "",
      assignee: req.card!.assignee ?? null,
      position: nextPositionInColumn(dataDir, tenantId, req.boardId!, req.columnId!),
      status: "open",
      version: 1,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    insertCard(dataDir, c);
    appendAudit(dataDir, { tenantId, actor, action: "native.board.card.created", boardId: c.boardId, columnId: c.columnId, cardId: c.id, detail: `Created card "${c.title}"` });
    publishEvent(dataDir, tenantId, "native.board.card.created", { boardId: c.boardId, columnId: c.columnId, cardId: c.id, title: c.title });
    return { kind: "card", card: c };
  }
  if (op === "updateCard" || op === "move" || op === "assign" || op === "close" || op === "reopen") {
    const c = getCard(dataDir, tenantId, req.cardId!)!;
    const mutation: { title?: string; description?: string; assignee?: string | null; status?: "open" | "closed"; columnId?: string } = {};
    if (op === "updateCard") {
      if (req.card!.title !== undefined) mutation.title = req.card!.title;
      if (req.card!.description !== undefined) mutation.description = req.card!.description;
      if (req.card!.columnId !== undefined) mutation.columnId = req.card!.columnId;
    }
    if (op === "move") {
      if (req.move!.columnId !== undefined) mutation.columnId = req.move!.columnId;
    }
    if (op === "assign") mutation.assignee = req.assign!.assignee ?? null;
    if (op === "close") mutation.status = "closed";
    if (op === "reopen") mutation.status = "open";
    const card = applyCardMutation(dataDir, tenantId, c.id, mutation, actor)!;
    const auditAction = op === "updateCard" ? "native.board.card.updated" : op === "move" ? "native.board.card.moved" : op === "assign" ? "native.board.card.assigned" : op === "close" ? "native.board.card.closed" : "native.board.card.reopened";
    const detail = op === "move" && mutation.columnId ? `Moved "${card.title}" to ${card.columnId}` : op === "assign" ? `Assigned "${card.title}" to ${card.assignee ?? "no one"}` : op === "close" ? `Closed "${card.title}"` : op === "reopen" ? `Reopened "${card.title}"` : `Updated "${card.title}"`;
    appendAudit(dataDir, { tenantId, actor, action: auditAction, boardId: card.boardId, columnId: card.columnId, cardId: card.id, detail });
    publishEvent(dataDir, tenantId, auditAction, { boardId: card.boardId, columnId: card.columnId, cardId: card.id, title: card.title, status: card.status, assignee: card.assignee });
    return { kind: "card", card };
  }
  if (op === "deleteCard") {
    const c = getCard(dataDir, tenantId, req.cardId!)!;
    removeCard(dataDir, tenantId, c.id);
    appendAudit(dataDir, { tenantId, actor, action: "native.board.card.deleted", boardId: c.boardId, columnId: c.columnId, cardId: c.id, detail: `Deleted card "${c.title}"` });
    publishEvent(dataDir, tenantId, "native.board.card.deleted", { boardId: c.boardId, cardId: c.id, title: c.title });
    return { kind: "card", card: { ...c, status: "deleted" as unknown as BoardCardRecord["status"] } };
  }
  throw new Error(`unknown board op: ${op}`);
}

/** Submit a board write. Validation FIRST — invalid writes 400 before the queue. */
export function submitBoardWrite(dataDir: string, tenantId: string, op: BoardOp, req: BoardWriteRequest, actor: string): BoardWriteResult {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, error: "tenantId and actor are required" };
  try {
    validateWrite(
      dataDir,
      tenantId,
      op,
      req,
      op === "create" ? { rejectRawIds: true } : {},
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { applied: false, pending: false, error: msg };
  }
  const action = ACTION_NAME[op];
  const params: Record<string, unknown> = {
    boardId: req.boardId ?? "__create__",
    columnId: req.columnId ?? undefined,
    cardId: req.cardId ?? undefined,
    op,
    via: req.via ?? "portal",
  };
  const gate = approvalGate(tenantId, action, "native-boards", params, { dataDir, workflowId: "native-boards" });
  if (gate.allowed) {
    try {
      const applied = applyMutation(dataDir, tenantId, op, req, actor);
      if (gate.autonomy && op !== "delete" && op !== "archive" && op !== "deleteColumn" && op !== "deleteCard") {
        try {
          recordAutonomyOutcome(tenantId, gate.workflowId || "native-boards", action, "native-boards", true, { dataDir, allowListId: gate.allowListId });
        } catch { /* outcome recording never blocks the already-authorized write */ }
      }
      return {
        applied: true,
        pending: false,
        ...(applied.kind === "board" ? { board: applied.board } : { card: applied.card }),
        op,
        autonomy: !!gate.autonomy,
        actionId: gate.actionId,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { applied: false, pending: false, error: msg };
    }
  }
  if (gate.error) return { applied: false, pending: false, error: gate.error };
  const pending = listPendingWrites(dataDir, tenantId);
  if (pending.length >= MAX_PENDING_BOARD_WRITES) {
    return { applied: false, pending: false, error: `Pending-write cap reached (${MAX_PENDING_BOARD_WRITES}) — approve or reject before writing more` };
  }
  // Dedupe: one pending write per target (like proposals' no double-decide).
  const target = op.startsWith("create") ? `__${op}__` : req.cardId ?? req.boardId ?? req.columnId ?? `__${op}__`;
  const existing = pending.find((w) => w.status === "pending" && w.op === op && (w.cardId ?? w.boardId ?? w.columnId ?? `__${w.op}__`) === target);
  if (existing) return { applied: false, pending: true, approvalActionId: existing.approvalActionId, op };
  const ptw: PendingBoardWrite = {
    id: generateBoardEntityId("bdw"),
    tenantId,
    boardId: req.boardId ?? null,
    columnId: req.columnId ?? null,
    cardId: req.cardId ?? null,
    op,
    payload: { data: req.data, column: req.column, card: req.card, move: req.move, assign: req.assign, via: req.via ?? "portal" },
    status: "pending",
    approvalActionId: gate.actionId || "",
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
  };
  savePendingWrite(dataDir, ptw);
  appendAudit(dataDir, { tenantId, actor: "system", action: "native.board.pending", boardId: req.boardId ?? "", columnId: req.columnId ?? "", cardId: req.cardId ?? "", detail: `Queued ${action} for approval (${ptw.id})` });
  return { applied: false, pending: true, approvalActionId: gate.actionId || "", op };
}

/** Approve-path executor: applies the pending write the approval card authorized. */
export function executePendingBoardWrite(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; board?: BoardRecord; card?: BoardCardRecord; ptwId: string; op: BoardOp; alreadyApplied?: boolean } | { ok: false; reason: string } {
  if (!tenantId?.trim() || !approvalActionId?.trim()) return { ok: false, reason: "tenantId and approvalActionId are required" };
  const ptw = listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId);
  if (!ptw) return { ok: false, reason: "no pending write for this approval action" };
  if (ptw.status !== "pending" && ptw.status !== "applied") return { ok: false, reason: "write was rejected" };
  if (ptw.status === "applied" && ptw.appliedResult?.cardId) {
    const rec = getCard(dataDir, tenantId, ptw.appliedResult.cardId);
    if (rec) return { ok: true, alreadyApplied: true, card: rec, ptwId: ptw.id, op: ptw.op };
    return { ok: false, reason: "already applied but card record missing" };
  }
  if (ptw.status === "applied" && ptw.appliedResult?.boardId) {
    const rec = getBoard(dataDir, tenantId, ptw.appliedResult.boardId);
    if (rec) return { ok: true, alreadyApplied: true, board: rec, ptwId: ptw.id, op: ptw.op };
    return { ok: false, reason: "already applied but board record missing" };
  }
  try {
    // Re-validate at apply (fail-closed): the board may have been archived meanwhile.
    validateWrite(dataDir, tenantId, ptw.op, {
      boardId: ptw.boardId ?? undefined,
      columnId: ptw.columnId ?? undefined,
      cardId: ptw.cardId ?? undefined,
      data: ptw.payload.data,
      column: ptw.payload.column,
      card: ptw.payload.card,
      move: ptw.payload.move,
      assign: ptw.payload.assign,
      via: ptw.payload.via,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
  try {
    const applied = applyMutation(dataDir, tenantId, ptw.op, {
      boardId: ptw.boardId ?? undefined,
      columnId: ptw.columnId ?? undefined,
      cardId: ptw.cardId ?? undefined,
      data: ptw.payload.data,
      column: ptw.payload.column,
      card: ptw.payload.card,
      move: ptw.payload.move,
      assign: ptw.payload.assign,
      via: ptw.payload.via,
    }, actor);
    markPendingWrite(dataDir, tenantId, ptw.id, "applied", actor, {
      status: applied.kind === "board" ? applied.board.status : applied.card.status,
      boardId: applied.kind === "board" ? applied.board.id : applied.card.boardId,
      columnId: applied.kind === "card" ? applied.card.columnId : undefined,
      cardId: applied.kind === "card" ? applied.card.id : undefined,
    });
    return { ok: true, ...(applied.kind === "board" ? { board: applied.board } : { card: applied.card }), ptwId: ptw.id, op: ptw.op };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", actor, { error: msg });
    return { ok: false, reason: msg };
  }
}

/** Record the owner decision + transition the shared approval card too. */
export function noteOwnerDecision(dataDir: string, tenantId: string, approvalActionId: string, decision: "approved" | "rejected", owner: string): void {
  const ptw = listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId);
  if (!ptw || ptw.status !== "pending") return; // idempotent
  if (decision === "approved") {
    const res = executePendingBoardWrite(dataDir, tenantId, approvalActionId, owner);
    markApproved(tenantId, approvalActionId, owner, { result: res.ok ? { status: res.card?.status ?? res.board?.status, cardId: res.card?.id, boardId: res.board?.id } : undefined, ...(res.ok ? {} : { resultError: res.reason }) }, dataDir);
  } else {
    markPendingWrite(dataDir, tenantId, ptw.id, "rejected", owner);
    markRejected(tenantId, approvalActionId, owner, dataDir);
  }
}

export { boardMutationFromInput, cardMutationFromInput, listCardsForBoard };

/** Typed workflow event → Phase 1.1 outbound (best-effort after the durable record). */
function publishEvent(dataDir: string, tenantId: string, eventType: string, payload: Record<string, unknown>): void {
  try {
    const n = publishWebhookEvent(dataDir, tenantId, eventType, { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` }, "native-boards");
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch { /* event publish is best-effort after the durable record */ }
}