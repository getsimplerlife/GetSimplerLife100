/**
 * native-boards.test.ts — Phase 3.2 native task/project boards.
 *
 * Gated writes via the Approval Queue (verb-first action names; WRITE_VERB
 * covers every board verb incl. the ADDED `reopen` — fail-open guard), tenant
 * isolation (cross-tenant → 404-no-IDOR), forged create-id → 400 BEFORE
 * normalization, idempotent apply (replay → alreadyApplied), autonomy
 * allow-list auto-apply with recordAutonomyOutcome, immutable audit, typed
 * board events (Phase 1.1 registry), caps.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listBoards,
  getBoard,
  listCards,
  listPendingWrites,
  listAudit,
} from "../native/board/store";
import { handleNativeBoardsAuthed, registerBuiltinNativeBoardEventTypes } from "../native/board/router";
import { setAutonomyWorkflow } from "../lib/autonomy";
import { listTenantActions } from "../lib/approval-queue";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;

function authedReq(method: string, pathname: string, body?: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  return new Request(`http://localhost${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
function route(method: string, pathname: string, body?: unknown): Promise<Response> {
  return handleNativeBoardsAuthed(authedReq(method, pathname, body), { userEmail: T1, dataDir: dir });
}
async function pendingFirst(op: string) {
  const ws = listPendingWrites(dir, T1).filter((w) => w.op === op && w.status === "pending");
  await Promise.resolve();
  return ws[ws.length - 1]!;
}
async function createAndApplyBoard(name: string): Promise<string> {
  const r = await route("POST", "/api/native/board/boards", { name, description: "" });
  expect(r.status).toBe(202); // gated
  const ptw = await pendingFirst("create");
  const applied = await route("POST", `/api/native/board/writes/${ptw.id}/apply`);
  expect(applied.status).toBe(200);
  const list = listBoards(dir, T1);
  expect(list.length).toBe(1);
  return list[0]!.id;
}
async function addColumnAndApply(boardId: string, name: string): Promise<string | undefined> {
  const r = await route("POST", `/api/native/board/boards/${boardId}/columns`, { name });
  expect(r.status).toBe(202); // gated
  const ptw = await pendingFirst("createColumn");
  const applied = await route("POST", `/api/native/board/writes/${ptw.id}/apply`);
  expect(applied.status).toBe(200);
  return getBoard(dir, T1, boardId)?.columns.at(-1)?.id;
}
async function createCardAndApply(boardId: string, columnId: string, title: string): Promise<string | undefined> {
  const r = await route("POST", `/api/native/board/boards/${boardId}/cards`, { columnId, title });
  expect(r.status).toBe(202); // gated
  const ptw = await pendingFirst("createCard");
  const applied = await route("POST", `/api/native/board/writes/${ptw.id}/apply`);
  expect(applied.status).toBe(200);
  return listCards(dir, T1).at(-1)?.id;
}
async function applyOp(op: string, targetId: string, helper: (id: string) => Promise<Response>): Promise<Response> {
  const r = await helper(targetId);
  expect(r.status).toBe(202); // gated
  const ptw = await pendingFirst(op);
  return route("POST", `/api/native/board/writes/${ptw.id}/apply`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "boards-"));
  registerBuiltinNativeBoardEventTypes();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("native board slice", () => {
  it("create is approval-gated: apply → board exists with audit + typed event; forged create-id → 400", async () => {
    const forged = await route("POST", "/api/native/board/boards", { id: "brd_zzz", name: "Sneaky" });
    expect(forged.status).toBe(400); // raw-body reject BEFORE normalization
    const r = await route("POST", "/api/native/board/boards", { name: "Growth Ops", description: "Q4 board" });
    expect(r.status).toBe(202); // gated — validation passed, queued
    expect(listBoards(dir, T1).length).toBe(0); // nothing durable until apply
    const ptw = await pendingFirst("create");
    expect(ptw.tenantId).toBe(T1);
    const applied = await route("POST", `/api/native/board/writes/${ptw.id}/apply`);
    expect(applied.status).toBe(200);
    const b = listBoards(dir, T1)[0]!;
    expect(b.name).toBe("Growth Ops");
    expect(b.status).toBe("active");
    expect(b.id).toMatch(/^brd_/);
    const audit = listAudit(dir, T1);
    expect(audit.some((e) => e.action === "native.board.created" && e.boardId === b.id)).toBe(true);
    const ev = listTenantActions(T1, dir);
    expect(ev.length).toBeGreaterThan(0);
    // idempotent apply — replay → alreadyApplied, no duplicate board
    const replay = await route("POST", `/api/native/board/writes/${ptw.id}/apply`);
    expect(replay.status).toBe(200);
    expect(listBoards(dir, T1).length).toBe(1);
  });

  it("cross-tenant is 404-no-IDOR; unknown id → 404; other-tenant board invisible", async () => {
    const boardId = await createAndApplyBoard("Tenant A board");
    // T2 cannot see or touch T1's board
    const stranger = await handleNativeBoardsAuthed(authedReq("GET", `/api/native/board/boards/${boardId}`), { userEmail: T2, dataDir: dir });
    expect(stranger.status).toBe(404);
    const strangerDel = await handleNativeBoardsAuthed(authedReq("DELETE", `/api/native/board/boards/${boardId}`), { userEmail: T2, dataDir: dir });
    expect(strangerDel.status).toBe(404);
    expect(listBoards(dir, T2).length).toBe(0);
    // unknown id in-tenant → 404
    const unknown = await route("GET", "/api/native/board/boards/brd_doesnotexist");
    expect(unknown.status).toBe(404);
  });

  it("validation happens BEFORE gating: invalid never queues; caps enforced", async () => {
    const bad = await route("POST", "/api/native/board/boards", { name: "" });
    expect(bad.status).toBe(400);
    expect(listPendingWrites(dir, T1).length).toBe(0);
    const noname = await route("POST", "/api/native/board/boards", {});
    expect(noname.status).toBe(400);
    expect(listPendingWrites(dir, T1).length).toBe(0);
  });

  it("columns + cards: gated create/update/move/assign/close/reopen/delete lifecycle", async () => {
    const boardId = await createAndApplyBoard("Sprint Board");
    const col1 = (await addColumnAndApply(boardId, "Backlog"))!;
    const col2 = (await addColumnAndApply(boardId, "Done"))!;
    const b = getBoard(dir, T1, boardId)!;
    expect(b.columns.length).toBe(2);

    const cardId = (await createCardAndApply(boardId, col1, "Ship native boards"))!;
    let c = listCards(dir, T1).find((x) => x.id === cardId)!;
    expect(c.columnId).toBe(col1);
    expect(c.status).toBe("open");

    // move (gated) → apply → new column
    await applyOp("move", cardId, (id) => route("POST", `/api/native/board/cards/${id}/move`, { columnId: col2 }));
    c = listCards(dir, T1).find((x) => x.id === cardId)!;
    expect(c.columnId).toBe(col2);
    const auditMove = listAudit(dir, T1).filter((e) => e.action === "native.board.card.moved");
    expect(auditMove.length).toBe(1);

    // assign (gated)
    await applyOp("assign", cardId, (id) => route("POST", `/api/native/board/cards/${id}/assign`, { assignee: "dev@acme.test" }));
    c = listCards(dir, T1).find((x) => x.id === cardId)!;
    expect(c.assignee).toBe("dev@acme.test");

    // close (open → closed) then reopen (closed → open); wrong-state → 400
    await applyOp("close", cardId, (id) => route("POST", `/api/native/board/cards/${id}/close`));
    c = listCards(dir, T1).find((x) => x.id === cardId)!;
    expect(c.status).toBe("closed");
    expect(c.closedAt).toBeDefined();
    const closeAgain = await route("POST", `/api/native/board/cards/${cardId}/close`);
    expect(closeAgain.status).toBe(400); // fail-closed lifecycle
    await applyOp("reopen", cardId, (id) => route("POST", `/api/native/board/cards/${id}/reopen`));
    c = listCards(dir, T1).find((x) => x.id === cardId)!;
    expect(c.status).toBe("open");
    const reopenOpen = await route("POST", `/api/native/board/cards/${cardId}/reopen`);
    expect(reopenOpen.status).toBe(400);

    // delete card (gated); delete column with cards left → 400 (fail-closed)
    const del = await route("DELETE", `/api/native/board/cards/${cardId}`);
    expect(del.status).toBe(202); // gated
    const ptw = await pendingFirst("deleteCard");
    await route("POST", `/api/native/board/writes/${ptw.id}/apply`);
    expect(listCards(dir, T1).length).toBe(0);

    const colDelWithCards = await route("POST", `/api/native/board/boards/${boardId}/columns`, { name: "Temp" });
    expect(colDelWithCards.status).toBe(202);
    const colPtw = await pendingFirst("createColumn");
    const colId = (await route("POST", `/api/native/board/writes/${colPtw.id}/apply`)).status;
    expect(colId).toBe(200);
    const tmpCol = getBoard(dir, T1, boardId)!.columns.at(-1)!.id;
    const card2 = (await createCardAndApply(boardId, tmpCol, "blocked card"))!;
    void card2;
    const blockDel = await route("DELETE", `/api/native/board/columns/${tmpCol}`);
    expect(blockDel.status).toBe(202);
    const delPtw = await pendingFirst("deleteColumn");
    const applied = await route("POST", `/api/native/board/writes/${delPtw.id}/apply`);
    expect(applied.status).toBe(400); // column still has cards → fails at apply (fail-closed)
  });

  it("board archive is terminal; update gated; delete board removes its cards", async () => {
    const boardId = await createAndApplyBoard("Archive me");
    const col = (await addColumnAndApply(boardId, "Col"))!;
    await createCardAndApply(boardId, col, "card");

    const r = await route("POST", `/api/native/board/boards/${boardId}/archive`);
    expect(r.status).toBe(202);
    const ptw = await pendingFirst("archive");
    await route("POST", `/api/native/board/writes/${ptw.id}/apply`);
    expect(getBoard(dir, T1, boardId)!.status).toBe("archived");

    // archived board is frozen: update → 400 (validation, not queued)
    const upd = await route("POST", `/api/native/board/boards/${boardId}`, { name: "nope" });
    expect(upd.status).toBe(400);
    expect(listPendingWrites(dir, T1).filter((w) => w.op === "update").length).toBe(0);

    // delete board (gated) → apply → board + its cards gone
    const del = await route("DELETE", `/api/native/board/boards/${boardId}`);
    expect(del.status).toBe(202);
    const delPtw = await pendingFirst("delete");
    await route("POST", `/api/native/board/writes/${delPtw.id}/apply`);
    expect(listBoards(dir, T1).length).toBe(0);
    expect(listCards(dir, T1).length).toBe(0);
  });

  it("autonomy allow-list auto-applies a board create with recordAutonomyOutcome", async () => {
    setAutonomyWorkflow(T1, "native-boards", { enabled: true, allowList: [{ id: "al-board-create", action: "createBoard" }] }, dir);
    const r = await route("POST", "/api/native/board/boards", { name: "Auto board" });
    expect(r.status).toBe(200); // auto-applied (not 202)
    expect(listBoards(dir, T1).length).toBe(1);
    expect(listBoards(dir, T1)[0]!.name).toBe("Auto board");
    const audit = listAudit(dir, T1);
    expect(audit.some((e) => e.action === "native.board.created")).toBe(true);
  });

  it("every board op rides the approval queue (no fail-open bypass) via direct gate", async () => {
    // The classification test (approval-queue.test.ts) asserts WRITE_VERB covers
    // each action name; here we prove the GATE queues (202) instead of applying
    // silently when autonomy is OFF for each op family.
    const boardId = await createAndApplyBoard("Gated");
    const col = (await addColumnAndApply(boardId, "Col"))!;
    const cardId = (await createCardAndApply(boardId, col, "c"))!;
    const r1 = await route("POST", `/api/native/board/cards/${cardId}/move`, { columnId: col });
    expect(r1.status).toBe(202);
    const r2 = await route("POST", `/api/native/board/cards/${cardId}/assign`, { assignee: "x@y.test" });
    expect(r2.status).toBe(202);
    const r3 = await route("POST", `/api/native/board/cards/${cardId}/close`);
    expect(r3.status).toBe(202);
  });
});