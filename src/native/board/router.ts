/**
 * native/board/router.ts — HTTP surface for Phase 3.2 native task/project boards.
 *
 * AUTHED (tenant) ONLY: /api/native/board* — list boards/detail, create/update/
 * archive/delete boards, create/update/delete columns, create/update/move/
 * assign/close/reopen/delete cards, writes/apply/reject + audit. Reads are
 * tenant-scoped (ctx.userEmail); every mutation is a GATED write (gate.ts).
 * 404 on any foreign/unknown id (fail-closed, no IDOR); forged id on create →
 * 400 BEFORE normalization (raw-body check); NO public/share surface (boards
 * are tenant-internal — nothing here is reachable pre-auth; prod-server wires
 * this block AFTER the session check → 401 fail-closed).
 *
 * Route parsing uses EXPLICIT SEGMENTS (no two-capture regex) — the Phase 1.4
 * rowMatch/idMatch shadowing bug class is avoided entirely.
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  listBoards,
  getBoard,
  listCards,
  getCard,
  listCardsForBoard,
  listPendingWrites,
  getPendingWriteById,
  findColumnOwner,
} from "./store";
import {
  executePendingBoardWrite,
  noteOwnerDecision,
  submitBoardWrite,
  boardMutationFromInput,
  cardMutationFromInput,
  type BoardWriteRequest,
} from "./gate";
import { isBoardId, isCardId, isColumnId } from "./validate";

export interface NativeBoardsCtx {
  userEmail: string;
  dataDir: string;
}

const json400 = (error: string) => Response.json({ error }, { status: 400 });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json401 = () => Response.json({ error: "Not authenticated" }, { status: 401 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|archived|open cards|only /.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 400 });
}

function boardSummary(b: ReturnType<typeof getBoard> extends null ? never : NonNullable<ReturnType<typeof getBoard>>, origin: string): Record<string, unknown> {
  void origin;
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    columns: b.columns,
    status: b.status,
    version: b.version,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    archivedAt: b.archivedAt ?? null,
  };
}
function cardSummary(c: NonNullable<ReturnType<typeof getCard>>): Record<string, unknown> {
  return {
    id: c.id,
    boardId: c.boardId,
    columnId: c.columnId,
    title: c.title,
    description: c.description,
    assignee: c.assignee,
    position: c.position,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    closedAt: c.closedAt ?? null,
  };
}

/** Build the gated-write request from raw segments + body (owner-facing only). */
async function buildWriteRequest(req: Request, seg: string[], _ctx: NativeBoardsCtx): Promise<{ req: BoardWriteRequest; ok: true } | { ok: false; response: Response }> {
  const out: BoardWriteRequest = { via: "portal" };
  const guard = (b: unknown): { ok: true; body: Record<string, unknown> } | { ok: false; response: Response } => {
    if (!b || typeof b !== "object" || Array.isArray(b)) return { ok: false, response: json400("body must be an object") };
    const o = b as Record<string, unknown>;
    if (typeof o.id === "string") return { ok: false, response: json400("invalid id on create (ids are server-assigned)") };
    return { ok: true, body: o };
  };
  try {
    const text = await req.text();
    const parsed = text ? JSON.parse(text) : {};
    const g = guard(parsed);
    if (!g.ok) return g;
    const b = g.body;
    // boards
    if (seg.length === 2 && seg[0] === "boards" && req.method === "POST") {
      out.data = boardMutationFromInput(b);
      return { ok: true, req: out };
    }
    // boards/:id [update], boards/:id/archive, boards/:id/columns, boards/:id/cards
    if (seg.length >= 3 && seg[0] === "boards") {
      out.boardId = seg[1];
      if (seg[2] === "archive" && req.method === "POST") return { ok: true, req: out };
      if (seg[2] === "columns" && req.method === "POST") {
        out.column = { name: typeof b.name === "string" ? b.name : "" };
        return { ok: true, req: out };
      }
      if (seg[2] === "cards" && req.method === "POST") {
        out.columnId = typeof b.columnId === "string" ? b.columnId : undefined;
        out.card = cardMutationFromInput(b);
        return { ok: true, req: out };
      }
    }
    // columns/:id [update], cards/:id [update|move|assign|close|reopen]
    if (seg.length >= 1 && seg[0] === "columns") {
      out.columnId = seg[1];
      out.column = { name: typeof b.name === "string" ? b.name : "" };
      return { ok: true, req: out };
    }
    if (seg.length >= 1 && seg[0] === "cards") {
      out.cardId = seg[1];
      const sub = seg[2];
      if (sub === "move") {
        out.move = { columnId: typeof b.columnId === "string" ? b.columnId : undefined, position: typeof b.position === "number" ? b.position : undefined };
      } else if (sub === "assign") {
        out.assign = { assignee: b.assignee !== undefined ? (typeof b.assignee === "string" ? b.assignee : null) : undefined };
      } else if (sub === "close" || sub === "reopen") {
        // no body needed
      } else {
        out.card = cardMutationFromInput(b);
        if (b.columnId !== undefined) out.card.columnId = typeof b.columnId === "string" ? b.columnId : undefined;
      }
      return { ok: true, req: out };
    }
    return { ok: true, req: out };
  } catch {
    return { ok: false, response: json400("invalid JSON body") };
  }
}

async function handleAuthedAsync(req: Request, ctx: NativeBoardsCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/board\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  if (!tenantId) return json401();

  // ── Top-level list: GET /api/native/board → boards + cards (tenant-only) ──
  if (seg.length === 0 && req.method === "GET") {
    return Response.json({
      data: {
        boards: listBoards(ctx.dataDir, tenantId).map((b) => boardSummary(b, url.origin)),
        cards: listCards(ctx.dataDir, tenantId).map(cardSummary),
      },
    });
  }

  // ── Boards ─────────────────────────────────────────────────────────────────
  if (seg[0] === "boards") {
    if (seg.length === 1 && req.method === "POST") {
      const w = await buildWriteRequest(req, ["boards", "POST"], ctx);
      if (!w.ok) return w.response;
      const res = submitBoardWrite(ctx.dataDir, tenantId, "create", w.req, tenantId);
      if (res.applied && res.board) return Response.json({ data: { status: "applied", board: boardSummary(res.board, url.origin) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
    }
    if (seg.length === 2) {
      const boardId = seg[1];
      if (!isBoardId(boardId)) return json404("Unknown native board endpoint");
      const board = getBoard(ctx.dataDir, tenantId, boardId);
      if (!board) return json404("Board not found"); // foreign/stranger → 404 (no IDOR)
      if (req.method === "GET") {
        return Response.json({ data: { board: boardSummary(board, url.origin), cards: listCardsForBoard(ctx.dataDir, tenantId, boardId).map(cardSummary) } });
      }
      if (req.method === "POST") {
        const w = await buildWriteRequest(req, ["boards", boardId, "update"], ctx);
        if (!w.ok) return w.response;
        const res = submitBoardWrite(ctx.dataDir, tenantId, "update", { ...w.req, boardId }, tenantId);
        if (res.applied && res.board) return Response.json({ data: { status: "applied", board: boardSummary(res.board, url.origin) } });
        if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
        return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
      }
      if (req.method === "DELETE") {
        const res = submitBoardWrite(ctx.dataDir, tenantId, "delete", { boardId, via: "portal" }, tenantId);
        if (res.applied) return Response.json({ data: { status: "deleted" } });
        if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
        return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
      }
      return json405();
    }
    if (seg.length === 3 && seg[2] === "archive" && req.method === "POST") {
      const boardId = seg[1];
      if (!isBoardId(boardId)) return json404("Unknown native board endpoint");
      const res = submitBoardWrite(ctx.dataDir, tenantId, "archive", { boardId, via: "portal" }, tenantId);
      if (res.applied && res.board) return Response.json({ data: { status: "applied", board: boardSummary(res.board, url.origin) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
    }
    if (seg.length === 3 && seg[2] === "columns" && req.method === "POST") {
      const boardId = seg[1];
      if (!isBoardId(boardId)) return json404("Unknown native board endpoint");
      const w = await buildWriteRequest(req, ["boards", boardId, "columns"], ctx);
      if (!w.ok) return w.response;
      const res = submitBoardWrite(ctx.dataDir, tenantId, "createColumn", { ...w.req, boardId }, tenantId);
      if (res.applied && res.board) return Response.json({ data: { status: "applied", board: boardSummary(res.board, url.origin) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
    }
    if (seg.length === 3 && seg[2] === "cards" && req.method === "POST") {
      const boardId = seg[1];
      if (!isBoardId(boardId)) return json404("Unknown native board endpoint");
      const w = await buildWriteRequest(req, ["boards", boardId, "cards"], ctx);
      if (!w.ok) return w.response;
      const res = submitBoardWrite(ctx.dataDir, tenantId, "createCard", { ...w.req, boardId }, tenantId);
      if (res.applied && res.card) return Response.json({ data: { status: "applied", card: cardSummary(res.card) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
    }
    return json404("Unknown native board endpoint");
  }

  // ── Columns ───────────────────────────────────────────────────────────────
  if (seg[0] === "columns" && seg.length === 2) {
    const columnId = seg[1];
    if (!isColumnId(columnId)) return json404("Unknown native board endpoint");
    if (req.method === "POST") {
      const w = await buildWriteRequest(req, ["columns", columnId], ctx);
      if (!w.ok) return w.response;
      const col = w.req.column;
      const ownerBoardId = findColumnOwner(ctx.dataDir, tenantId, columnId);
      if (!ownerBoardId) return json404("Column not found"); // foreign/stranger → 404 (no IDOR)
      const res = submitBoardWrite(ctx.dataDir, tenantId, "updateColumn", { ...w.req, column: col, boardId: ownerBoardId, columnId }, tenantId);
      if (res.applied && res.board) return Response.json({ data: { status: "applied", board: boardSummary(res.board, url.origin) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
    }
    if (req.method === "DELETE") {
      const ownerBoardId = findColumnOwner(ctx.dataDir, tenantId, columnId);
      if (!ownerBoardId) return json404("Column not found"); // foreign/stranger → 404 (no IDOR)
      const res = submitBoardWrite(ctx.dataDir, tenantId, "deleteColumn", { boardId: ownerBoardId, columnId, via: "portal" }, tenantId);
      if (res.applied && res.board) return Response.json({ data: { status: "applied", board: boardSummary(res.board, url.origin) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
    }
    return json405();
  }

  // ── Cards ─────────────────────────────────────────────────────────────────
  if (seg[0] === "cards" && seg.length >= 1 && seg.length <= 3) {
    const cardId = seg[1];
    if (!isCardId(cardId)) return json404("Unknown native board endpoint");
    const card = getCard(ctx.dataDir, tenantId, cardId);
    if (!card) return json404("Card not found"); // foreign/stranger → 404 (no IDOR)
    const sub = seg[2];
    if (!sub && req.method === "POST") {
      const w = await buildWriteRequest(req, ["cards", cardId], ctx);
      if (!w.ok) return w.response;
      const res = submitBoardWrite(ctx.dataDir, tenantId, "updateCard", { ...w.req, cardId, boardId: card.boardId }, tenantId);
      if (res.applied && res.card) return Response.json({ data: { status: "applied", card: cardSummary(res.card) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
    }
    if (!sub && req.method === "DELETE") {
      const res = submitBoardWrite(ctx.dataDir, tenantId, "deleteCard", { cardId, boardId: card.boardId, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "deleted" } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
    }
    if (sub && req.method === "POST") {
      const w = await buildWriteRequest(req, ["cards", cardId, sub], ctx);
      if (!w.ok) return w.response;
      const op = sub === "move" ? "move" : sub === "assign" ? "assign" : sub === "close" ? "close" : sub === "reopen" ? "reopen" : null;
      if (!op) return json404("Unknown native board endpoint");
      const res = submitBoardWrite(ctx.dataDir, tenantId, op, { ...w.req, cardId, boardId: card.boardId }, tenantId);
      if (res.applied && res.card) return Response.json({ data: { status: "applied", card: cardSummary(res.card) } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus((res as { error?: string }).error ?? "board write failed");
    }
    return json405();
  }

  // ── Pending writes (owner decision lanes) ─────────────────────────────────
  if (seg[0] === "writes") {
    if (seg.length === 1 && req.method === "GET") {
      return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId) } });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject") && req.method === "POST") {
      const w = getPendingWriteById(ctx.dataDir, tenantId, seg[1]);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this board action");
      if (seg[2] === "apply") {
        const res = executePendingBoardWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
        if (!res.ok) return gateErrorStatus(res.reason);
        noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "approved", tenantId);
        return Response.json({ data: { status: "applied", ptwId: res.ptwId, op: res.op } });
      }
      noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
      return Response.json({ data: { status: "rejected", ptwId: w.id } });
    }
    return json405();
  }

  return json404("Unknown native board endpoint");
}

/** AUTHED handler (prod-server wires this AFTER the session check → 401 fail-closed). */
export function handleNativeBoardsAuthed(req: Request, ctx: NativeBoardsCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch(() => Response.json({ error: "Internal error" }, { status: 500 }));
}

// ── Built-in typed events (Phase 1.1 registry pattern, 2.1–3.1) ─────────────
export function registerBuiltinNativeBoardEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.board.created",
    "native.board.updated",
    "native.board.archived",
    "native.board.deleted",
    "native.board.column.created",
    "native.board.column.updated",
    "native.board.column.deleted",
    "native.board.card.created",
    "native.board.card.updated",
    "native.board.card.moved",
    "native.board.card.assigned",
    "native.board.card.closed",
    "native.board.card.reopened",
    "native.board.card.deleted",
  ]) {
    registerNativeEventType(t, base);
  }
}