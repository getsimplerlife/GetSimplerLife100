import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";

interface ColumnSummary {
  id: string;
  name: string;
  position: number;
}
interface BoardSummary {
  id: string;
  name: string;
  description: string;
  columns: ColumnSummary[];
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
interface CardSummary {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  assignee: string | null;
  position: number;
  status: string;
}
interface PendingWrite {
  id: string;
  op: string;
  boardId: string | null;
  cardId: string | null;
  status: string;
  approvalActionId: string;
  requestedBy: string;
  requestedAt: string;
}

const STATUS_LABEL: Record<string, string> = { active: "Active", archived: "Archived" };
const CARD_STATUS_LABEL: Record<string, string> = { open: "Open", closed: "Closed" };

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export default function BoardsPage() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [selected, setSelected] = useState<BoardSummary | null>(null);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [newColumn, setNewColumn] = useState("");
  const [newCard, setNewCard] = useState("");
  const [selectedColumn, setSelectedColumn] = useState("");
  const [assignTo, setAssignTo] = useState("");

  const refreshBoards = useCallback(async () => {
    const d = await api<{ data: { boards: BoardSummary[] } }>("GET", "/api/native/board");
    setBoards(d.data.boards);
  }, []);
  const refreshDetail = useCallback(
    async (boardId: string) => {
      const d = await api<{ data: { board: BoardSummary; cards: CardSummary[] } }>("GET", `/api/native/board/boards/${boardId}`);
      setSelected(d.data.board);
      setCards(d.data.cards);
    },
    [],
  );
  const refreshWrites = useCallback(async () => {
    try {
      const d = await api<{ data: { writes: PendingWrite[] } }>("GET", "/api/native/board/writes");
      setWrites(d.data.writes.filter((w) => w.status === "pending"));
    } catch {
      setWrites([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([refreshBoards(), refreshWrites()])
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [refreshBoards, refreshWrites]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    setFeedback("");
    setError("");
    try {
      await fn();
      await refreshWrites();
      setFeedback(okMsg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const createBoard = () =>
    act(async () => {
      setCreating(true);
      try {
        await api("POST", "/api/native/board/boards", { name, description });
        setFeedback("Board queued for approval (gated write).");
        setName("");
        setDescription("");
        await refreshBoards();
      } finally {
        setCreating(false);
      }
    }, "Board created (approved or queued).");

  const openBoard = (id: string) =>
    act(
      () => refreshDetail(id),
      "",
    );

  const addColumn = (boardId: string) =>
    act(
      async () => {
        await api("POST", `/api/native/board/boards/${boardId}/columns`, { name: newColumn });
        setNewColumn("");
        await refreshDetail(boardId);
      },
      "Column queued for approval.",
    );

  const addCard = (boardId: string) =>
    act(
      async () => {
        if (!selectedColumn) throw new Error("pick a column first");
        await api("POST", `/api/native/board/boards/${boardId}/cards`, { columnId: selectedColumn, title: newCard });
        setNewCard("");
        await refreshDetail(boardId);
      },
      "Card queued for approval.",
    );

  const cardOp = (id: string, sub: string, body?: unknown) =>
    act(
      async () => {
        await api("POST", `/api/native/board/cards/${id}/${sub}`, body ?? {});
        if (selected) await refreshDetail(selected.id);
      },
      sub === "move" ? "Move queued." : sub === "assign" ? "Assignment queued." : sub === "close" ? "Close queued." : "Reopen queued.",
    );

  const deleteCard = (id: string) =>
    act(
      async () => {
        await api("DELETE", `/api/native/board/cards/${id}`);
        if (selected) await refreshDetail(selected.id);
      },
      "Card delete queued.",
    );

  const archiveBoard = (boardId: string) =>
    act(
      async () => {
        await api("POST", `/api/native/board/boards/${boardId}/archive`);
        await refreshBoards();
        setSelected(null);
        setCards([]);
      },
      "Archive queued for approval.",
    );

  const applyWrite = (w: PendingWrite) =>
    act(
      async () => {
        const d = await api<{ data: { status: string } }>("POST", `/api/native/board/writes/${w.id}/apply`);
        setFeedback(`Apply → ${d.data.status}.`);
        if (w.boardId) await refreshDetail(w.boardId).catch(() => undefined);
        await refreshBoards();
      },
      "Pending write applied.",
    );

  const rejectWrite = (w: PendingWrite) =>
    act(
      async () => {
        await api("POST", `/api/native/board/writes/${w.id}/reject`);
        await refreshWrites();
      },
      "Pending write rejected.",
    );

  if (loading) return <div className="p-10 text-center text-slate-500">Loading boards…</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Boards</h1>
          <p className="text-sm text-slate-500">Native task/project boards — every write is approval-gated.</p>
        </div>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Board name" className="rounded border px-2 py-1 text-sm" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="rounded border px-2 py-1 text-sm" />
          <Button disabled={creating || !name.trim()} onClick={createBoard}>
            {creating ? "Creating…" : "New board"}
          </Button>
        </div>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {feedback && <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{feedback}</div>}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {boards.map((b) => (
            <Card key={b.id} className="cursor-pointer p-4" onClick={() => void openBoard(b.id)}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800">{b.name}</h3>
                <Badge variant={b.status === "archived" ? "stone" : "emerald"}>{STATUS_LABEL[b.status] ?? b.status}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">{b.description}</p>
              <p className="mt-2 text-xs text-slate-400">{b.columns.length} columns · selected: {selected?.id === b.id ? "yes" : "click to open"}</p>
            </Card>
          ))}
          {boards.length === 0 && <p className="text-sm text-slate-400">No boards yet — create one (it rides the approval queue).</p>}
        </div>

        <Card className="p-5">
          {!selected ? (
            <div className="flex h-40 items-center justify-center rounded border border-dashed border-slate-200 text-sm text-slate-400">
              Select a board to open it.
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{selected.name}</h2>
                  <span className="text-xs text-slate-500">v{selected.version} · {STATUS_LABEL[selected.status] ?? selected.status}</span>
                </div>
                {selected.status === "active" && (
                  <Button variant="secondary" onClick={() => void archiveBoard(selected.id)}>
                    Archive board
                  </Button>
                )}
              </div>
              {selected.status === "active" && (
                <div className="mt-3 flex gap-2">
                  <input value={newColumn} onChange={(e) => setNewColumn(e.target.value)} placeholder="Column name" className="rounded border px-2 py-1 text-sm" />
                  <Button disabled={!newColumn.trim()} onClick={() => void addColumn(selected.id)}>
                    Add column
                  </Button>
                  <select value={selectedColumn} onChange={(e) => setSelectedColumn(e.target.value)} className="rounded border px-2 py-1 text-sm">
                    <option value="">column…</option>
                    {selected.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input value={newCard} onChange={(e) => setNewCard(e.target.value)} placeholder="Card title" className="rounded border px-2 py-1 text-sm" />
                  <Button disabled={!newCard.trim() || !selectedColumn} onClick={() => void addCard(selected.id)}>
                    Add card
                  </Button>
                </div>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {selected.columns.map((col) => (
                  <div key={col.id} className="rounded border bg-slate-50 p-3">
                    <h4 className="mb-2 text-sm font-semibold text-slate-700">{col.name}</h4>
                    <div className="space-y-2">
                      {cards
                        .filter((c) => c.columnId === col.id)
                        .sort((a, b) => a.position - b.position)
                        .map((c) => (
                          <div key={c.id} className="rounded border bg-white p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-slate-800">{c.title}</p>
                              <Badge variant={c.status === "closed" ? "stone" : "blue"}>{CARD_STATUS_LABEL[c.status] ?? c.status}</Badge>
                            </div>
                            {c.description && <p className="mt-1 text-xs text-slate-500">{c.description}</p>}
                            <p className="mt-1 text-xs text-slate-400">@{c.assignee ?? "unassigned"}</p>
                            {selected.status === "active" && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                <select
                                  className="rounded border px-1 py-0.5 text-xs"
                                  value=""
                                  onChange={(e) => e.target.value && void cardOp(c.id, "move", { columnId: e.target.value })}
                                >
                                  <option value="">move…</option>
                                  {selected.columns
                                    .filter((x) => x.id !== c.columnId)
                                    .map((x) => (
                                      <option key={x.id} value={x.id}>
                                        {x.name}
                                      </option>
                                    ))}
                                </select>
                                <input
                                  className="w-24 rounded border px-1 py-0.5 text-xs"
                                  placeholder="assignee"
                                  value={assignTo}
                                  onChange={(e) => setAssignTo(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && void cardOp(c.id, "assign", { assignee: assignTo })}
                                />
                                <Button variant="secondary" size="sm" onClick={() => void cardOp(c.id, c.status === "open" ? "close" : "reopen", {})}>
                                  {c.status === "open" ? "Close" : "Reopen"}
                                </Button>
                                <Button variant="danger" size="sm" onClick={() => void deleteCard(c.id)}>
                                  Del
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      {cards.filter((c) => c.columnId === col.id).length === 0 && <p className="text-xs text-slate-400">empty</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {writes.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Pending approvals ({writes.length})</h3>
          <div className="space-y-2">
            {writes.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span className="text-slate-600">
                  {w.op} <span className="text-slate-400">· {w.requestedBy} · {new Date(w.requestedAt).toLocaleString()}</span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => void applyWrite(w)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void rejectWrite(w)}>
                    Reject
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}