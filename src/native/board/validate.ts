/**
 * native/board/validate.ts — Phase 3.2 native BOARD validation.
 *
 * Shape/syntax only. Existence checks (boardId/columnId/cardId in-tenant,
 * lifecycle states) happen in the gate/store where the data lives. Fail-closed:
 * unknown keys are dropped, ids are pattern-checked, and nothing here ever
 * trusts a client-supplied record id.
 */
import {
  MAX_BOARD_ASSIGNEE,
  MAX_BOARD_CARD_DESC,
  MAX_BOARD_CARD_TITLE,
  MAX_BOARD_COLUMN_NAME,
  MAX_BOARD_DESC,
  MAX_BOARD_NAME,
  type BoardCardMutation,
  type BoardColumnMutation,
  type BoardMutation,
} from "./types";

export type ValidateResult = { ok: true } | { ok: false; error: string };

export function isBoardId(v: unknown): v is string {
  return typeof v === "string" && /^brd_[A-Za-z0-9_-]+$/.test(v);
}
export function isColumnId(v: unknown): v is string {
  return typeof v === "string" && /^col_[A-Za-z0-9_-]+$/.test(v);
}
export function isCardId(v: unknown): v is string {
  return typeof v === "string" && /^crd_[A-Za-z0-9_-]+$/.test(v);
}

/** Validate + normalize a board mutation (name/description only). */
export function validateBoardMutation(m: BoardMutation): ValidateResult & { data?: BoardMutation } {
  const out: BoardMutation = {};
  if (m.name !== undefined) {
    const n = typeof m.name === "string" ? m.name.trim() : "";
    if (n.length < 1 || n.length > MAX_BOARD_NAME) return { ok: false, error: `name must be a 1..${MAX_BOARD_NAME}-char string` };
    out.name = n;
  }
  if (m.description !== undefined) {
    const d = typeof m.description === "string" ? m.description : "";
    if (d.length > MAX_BOARD_DESC) return { ok: false, error: `description must be ≤ ${MAX_BOARD_DESC} chars` };
    out.description = d;
  }
  return { ok: true, data: out };
}

/** Validate a column mutation (name only). */
export function validateColumnMutation(m: BoardColumnMutation): ValidateResult & { data?: BoardColumnMutation } {
  const n = typeof m.name === "string" ? m.name.trim() : "";
  if (n.length < 1 || n.length > MAX_BOARD_COLUMN_NAME) return { ok: false, error: `name must be a 1..${MAX_BOARD_COLUMN_NAME}-char string` };
  return { ok: true, data: { name: n } };
}

/** Validate + normalize a card mutation. */
export function validateCardMutation(m: BoardCardMutation): ValidateResult & { data?: BoardCardMutation } {
  const out: BoardCardMutation = {};
  if (m.title !== undefined) {
    const t = typeof m.title === "string" ? m.title.trim() : "";
    if (t.length < 1 || t.length > MAX_BOARD_CARD_TITLE) return { ok: false, error: `title must be a 1..${MAX_BOARD_CARD_TITLE}-char string` };
    out.title = t;
  }
  if (m.description !== undefined) {
    const d = typeof m.description === "string" ? m.description : "";
    if (d.length > MAX_BOARD_CARD_DESC) return { ok: false, error: `description must be ≤ ${MAX_BOARD_CARD_DESC} chars` };
    out.description = d;
  }
  if (m.assignee !== undefined && m.assignee !== null) {
    const a = typeof m.assignee === "string" ? m.assignee.trim() : "";
    if (a.length < 1 || a.length > MAX_BOARD_ASSIGNEE) return { ok: false, error: `assignee must be null or a 1..${MAX_BOARD_ASSIGNEE}-char email` };
    out.assignee = a;
  } else if (m.assignee === null) {
    out.assignee = null;
  }
  return { ok: true, data: out };
}

/** Build a BoardMutation from a create/update body (raw keys dropped). */
export function boardMutationFromInput(body: Record<string, unknown>): BoardMutation {
  const m: BoardMutation = {};
  if (typeof body.name === "string") m.name = body.name;
  if (typeof body.description === "string") m.description = body.description;
  return m;
}

/** Build a card mutation from a create/update body (raw keys dropped). */
export function cardMutationFromInput(body: Record<string, unknown>): BoardCardMutation {
  const m: BoardCardMutation = {};
  if (typeof body.title === "string") m.title = body.title;
  if (typeof body.description === "string") m.description = body.description;
  if (typeof body.columnId === "string") m.columnId = body.columnId;
  if (body.assignee !== undefined) m.assignee = typeof body.assignee === "string" ? body.assignee : null;
  return m;
}