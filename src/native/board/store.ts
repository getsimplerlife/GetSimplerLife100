/**
 * native/board/store.ts — durable, tenant-keyed BOARD store (Phase 3.2).
 *
 * - Every read/write takes tenantId explicitly and resolves the EXACT tenant
 *   map first — zero cross-tenant paths (a foreign board/card id resolves to
 *   null → fail-closed 404 upstream).
 * - Mutations are applied ONLY by the gated write path (gate.ts) or the
 *   idempotent pending-apply executor — the store never mutates on its own.
 * - Every mutation appends an IMMUTABLE native.board.* audit entry.
 * - Cards keep their own records (boardId + columnId pointers) so ordering
 *   and cross-column moves stay cheap and exact-id only.
 */
import { randomBytes } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import {
  NATIVE_BOARDS_KEY,
  NATIVE_BOARDS_AUDIT_KEY,
  MAX_BOARDS_PER_TENANT,
  MAX_COLUMNS_PER_BOARD,
  MAX_BOARD_NAME,
  MAX_BOARD_DESC,
  MAX_BOARD_COLUMN_NAME,
  MAX_BOARD_CARD_TITLE,
  MAX_BOARD_CARD_DESC,
  type BoardCardRecord,
  type BoardCardStatus,
  type BoardColumn,
  type BoardColumnMutation,
  type BoardMutation,
  type BoardRecord,
  type BoardStatus,
  type PendingBoardWrite,
} from "./types";

export interface NativeBoardAuditEntry {
  id: string;
  ts: string;
  tenantId: string;
  actor: string;
  action: string; // native.board.<...>.*
  boardId?: string;
  columnId?: string;
  cardId?: string;
  detail: string;
}

interface TenantBoardState {
  boards: BoardRecord[];
  cards: BoardCardRecord[];
  pendingWrites: PendingBoardWrite[];
}

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadState(dataDir: string): Record<string, TenantBoardState> {
  const raw = readJSON(dataPath(dataDir, NATIVE_BOARDS_KEY));
  return raw && typeof raw === "object" ? (raw as Record<string, TenantBoardState>) : {};
}
function saveState(dataDir: string, state: Record<string, TenantBoardState>): void {
  writeJSON(dataPath(dataDir, NATIVE_BOARDS_KEY), state);
}
export function generateBoardEntityId(prefix: "brd" | "col" | "crd" | "bdw"): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
}

// ── Boards ───────────────────────────────────────────────────────────────────
export function listBoards(dataDir: string, tenantId: string): BoardRecord[] {
  return loadState(dataDir)[tenantId]?.boards ?? [];
}
export function getBoard(dataDir: string, tenantId: string, boardId: string): BoardRecord | null {
  return listBoards(dataDir, tenantId).find((b) => b.id === boardId) ?? null;
}
export function countBoards(dataDir: string, tenantId: string): number {
  return listBoards(dataDir, tenantId).length;
}
/** Insert a NEW board (validated upstream; gated executor only). */
export function insertBoard(dataDir: string, record: BoardRecord): void {
  const state = loadState(dataDir);
  const tenant = state[record.tenantId] ?? { boards: [], cards: [], pendingWrites: [] };
  if (tenant.boards.length >= MAX_BOARDS_PER_TENANT) {
    throw new Error(`Board cap reached (${MAX_BOARDS_PER_TENANT})`);
  }
  state[record.tenantId] = tenant;
  tenant.boards.push(record);
  saveState(dataDir, state);
}
/** Hard-remove an existing board (gated delete executor only). */
export function removeBoard(dataDir: string, tenantId: string, boardId: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.boards.findIndex((b) => b.id === boardId) ?? -1;
  if (!tenant || idx < 0) return false;
  tenant.boards.splice(idx, 1);
  tenant.cards = tenant.cards.filter((c) => c.boardId !== boardId);
  saveState(dataDir, state);
  return true;
}
/**
 * Apply a validated mutation + status transition to an existing board. Fields
 * are re-bounded here as defense-in-depth (slice + trim) — the gate validated.
 */
export function applyBoardMutation(
  dataDir: string,
  tenantId: string,
  boardId: string,
  mutation: BoardMutation,
  nextStatus: BoardStatus | null,
  actor: string,
): BoardRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.boards.findIndex((b) => b.id === boardId) ?? -1;
  if (!tenant || idx < 0) return null;
  const b = tenant.boards[idx];
  const now = new Date().toISOString();
  const updated: BoardRecord = {
    ...b,
    ...(mutation.name !== undefined ? { name: mutation.name.trim().slice(0, MAX_BOARD_NAME) } : {}),
    ...(mutation.description !== undefined ? { description: mutation.description.trim().slice(0, MAX_BOARD_DESC) } : {}),
    ...(nextStatus !== null ? { status: nextStatus } : {}),
    ...(nextStatus === "archived" ? { archivedAt: now, archivedBy: actor } : {}),
    version: b.version + 1,
    updatedAt: now,
    updatedBy: actor,
  };
  tenant.boards[idx] = updated;
  saveState(dataDir, state);
  return updated;
}

// ── Columns (embedded in the board record) ───────────────────────────────────
export function getColumn(dataDir: string, tenantId: string, boardId: string, columnId: string): BoardColumn | null {
  return getBoard(dataDir, tenantId, boardId)?.columns.find((c) => c.id === columnId) ?? null;
}

/** Server-side owner resolution for column routes (never trusts a client boardId). */
export function findColumnOwner(dataDir: string, tenantId: string, columnId: string): string | null {
  const b = listBoards(dataDir, tenantId).find((x) => x.columns.some((c) => c.id === columnId));
  return b?.id ?? null;
}
export function addColumn(dataDir: string, tenantId: string, boardId: string, column: BoardColumn): BoardRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.boards.findIndex((b) => b.id === boardId) ?? -1;
  if (!tenant || idx < 0) return null;
  const b = tenant.boards[idx];
  if (b.columns.length >= MAX_COLUMNS_PER_BOARD) throw new Error(`Column cap reached (${MAX_COLUMNS_PER_BOARD})`);
  b.columns.push({ ...column, position: b.columns.length });
  tenant.boards[idx] = b;
  saveState(dataDir, state);
  return b;
}
export function updateColumn(
  dataDir: string,
  tenantId: string,
  boardId: string,
  columnId: string,
  mutation: BoardColumnMutation,
  actor: string,
): BoardRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const bidx = tenant?.boards.findIndex((b) => b.id === boardId) ?? -1;
  if (!tenant || bidx < 0) return null;
  const b = tenant.boards[bidx];
  const cidx = b.columns.findIndex((c) => c.id === columnId);
  if (cidx < 0) return null;
  const now = new Date().toISOString();
  b.columns[cidx] = { ...b.columns[cidx], name: mutation.name.trim().slice(0, MAX_BOARD_COLUMN_NAME) };
  b.version = b.version + 1;
  b.updatedAt = now;
  b.updatedBy = actor;
  tenant.boards[bidx] = b;
  saveState(dataDir, state);
  return b;
}
export function removeColumn(dataDir: string, tenantId: string, boardId: string, columnId: string): BoardRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const bidx = tenant?.boards.findIndex((b) => b.id === boardId) ?? -1;
  if (!tenant || bidx < 0) return null;
  const b = tenant.boards[bidx];
  const cidx = b.columns.findIndex((c) => c.id === columnId);
  if (cidx < 0) return null;
  if (tenant.cards.some((c) => c.boardId === boardId && c.columnId === columnId)) {
    throw new Error("column still has cards — move or delete them first (fail-closed)");
  }
  const removed = b.columns.splice(cidx, 1)[0];
  // Re-index remaining columns (dense 0-based order) and cards in them.
  b.columns.forEach((c, i) => (c.position = i));
  b.version = b.version + 1;
  b.updatedAt = new Date().toISOString();
  tenant.boards[bidx] = b;
  saveState(dataDir, state);
  void removed;
  return b;
}

// ── Cards ────────────────────────────────────────────────────────────────────
export function listCards(dataDir: string, tenantId: string): BoardCardRecord[] {
  return loadState(dataDir)[tenantId]?.cards ?? [];
}
export function getCard(dataDir: string, tenantId: string, cardId: string): BoardCardRecord | null {
  return listCards(dataDir, tenantId).find((c) => c.id === cardId) ?? null;
}
export function listCardsForBoard(dataDir: string, tenantId: string, boardId: string): BoardCardRecord[] {
  return listCards(dataDir, tenantId).filter((c) => c.boardId === boardId);
}
export function countCardsForBoard(dataDir: string, tenantId: string, boardId: string): number {
  return listCardsForBoard(dataDir, tenantId, boardId).length;
}
export function insertCard(dataDir: string, record: BoardCardRecord): void {
  const state = loadState(dataDir);
  const tenant = state[record.tenantId] ?? { boards: [], cards: [], pendingWrites: [] };
  state[record.tenantId] = tenant;
  tenant.cards.push(record);
  saveState(dataDir, state);
}
export function removeCard(dataDir: string, tenantId: string, cardId: string): boolean {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.cards.findIndex((c) => c.id === cardId) ?? -1;
  if (!tenant || idx < 0) return false;
  tenant.cards.splice(idx, 1);
  saveState(dataDir, state);
  return true;
}
/**
 * Apply a validated card mutation (title/description/assignee/status/column).
 * position is re-derived when the column changes. Returns the updated card or
 * null (unknown → 404). Idempotent-safe at the store level: the gate guards
 * state transitions; here we just write.
 */
export function applyCardMutation(
  dataDir: string,
  tenantId: string,
  cardId: string,
  mutation: { title?: string; description?: string; assignee?: string | null; status?: BoardCardStatus; columnId?: string },
  actor: string,
): BoardCardRecord | null {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const idx = tenant?.cards.findIndex((c) => c.id === cardId) ?? -1;
  if (!tenant || idx < 0) return null;
  const c = tenant.cards[idx];
  const now = new Date().toISOString();
  const movingColumn = mutation.columnId !== undefined && mutation.columnId !== c.columnId;
  const updated: BoardCardRecord = {
    ...c,
    ...(mutation.title !== undefined ? { title: mutation.title.trim().slice(0, MAX_BOARD_CARD_TITLE) } : {}),
    ...(mutation.description !== undefined ? { description: mutation.description.trim().slice(0, MAX_BOARD_CARD_DESC) } : {}),
    ...(mutation.assignee !== undefined ? { assignee: mutation.assignee } : {}),
    ...(mutation.status === "closed" ? { status: "closed" as const, closedAt: now, closedBy: actor } : {}),
    ...(mutation.status === "open" ? { status: "open" as const, reopenedAt: now } : {}),
    ...(movingColumn ? { columnId: mutation.columnId!, position: nextPositionInColumn(dataDir, tenantId, c.boardId, mutation.columnId!) } : {}),
    version: c.version + 1,
    updatedAt: now,
    updatedBy: actor,
  };
  tenant.cards[idx] = updated;
  saveState(dataDir, state);
  return updated;
}

/** Next 0-based position at the END of a target column (for moves/creates). */
export function nextPositionInColumn(dataDir: string, tenantId: string, boardId: string, columnId: string): number {
  return listCardsForBoard(dataDir, tenantId, boardId).filter((c) => c.columnId === columnId).length;
}

// ── Pending writes (durable mirror of the approval card) ────────────────────
export function listPendingWrites(dataDir: string, tenantId: string): PendingBoardWrite[] {
  return loadState(dataDir)[tenantId]?.pendingWrites ?? [];
}
export function savePendingWrite(dataDir: string, w: PendingBoardWrite): void {
  const state = loadState(dataDir);
  const tenant = state[w.tenantId] ?? { boards: [], cards: [], pendingWrites: [] };
  state[w.tenantId] = tenant;
  tenant.pendingWrites.push(w);
  saveState(dataDir, state);
}
export function getPendingWriteByAction(dataDir: string, tenantId: string, approvalActionId: string): PendingBoardWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.approvalActionId === approvalActionId) ?? null;
}
export function getPendingWriteById(dataDir: string, tenantId: string, id: string): PendingBoardWrite | null {
  return listPendingWrites(dataDir, tenantId).find((w) => w.id === id) ?? null;
}
export function markPendingWrite(
  dataDir: string,
  tenantId: string,
  id: string,
  status: "applied" | "rejected",
  actor: string,
  result?: { status?: string; boardId?: string; columnId?: string; cardId?: string; error?: string },
): void {
  const state = loadState(dataDir);
  const tenant = state[tenantId];
  const w = tenant?.pendingWrites.find((x) => x.id === id);
  if (!tenant || !w || w.status !== "pending") return; // idempotent
  const now = new Date().toISOString();
  if (status === "applied") {
    w.status = "applied";
    w.appliedAt = now;
    w.appliedBy = actor;
    w.appliedResult = { status: result?.status ?? "applied", boardId: result?.boardId, columnId: result?.columnId, cardId: result?.cardId };
  } else {
    w.status = "rejected";
    w.error = result?.error ?? "rejected by owner";
  }
  saveState(dataDir, state);
}

// ── Immutable audit (append-only, keyed by tenant) ──────────────────────────
function loadAudit(dataDir: string): NativeBoardAuditEntry[] {
  const raw = readJSON(dataPath(dataDir, NATIVE_BOARDS_AUDIT_KEY));
  return Array.isArray(raw) ? (raw as NativeBoardAuditEntry[]) : [];
}
export function appendAudit(dataDir: string, entry: Omit<NativeBoardAuditEntry, "id" | "ts">): void {
  const audit = loadAudit(dataDir);
  audit.push({
    id: generateBoardEntityId("bdw"),
    ts: new Date().toISOString(),
    ...entry,
  });
  writeJSON(dataPath(dataDir, NATIVE_BOARDS_AUDIT_KEY), audit);
}
export function listAudit(dataDir: string, tenantId: string): NativeBoardAuditEntry[] {
  return loadAudit(dataDir).filter((e) => e.tenantId === tenantId);
}