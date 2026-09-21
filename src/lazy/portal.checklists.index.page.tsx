import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";

interface ChecklistSummary {
  id: string;
  name: string;
  kind: string;
  status: string;
  progress: { done: number; total: number };
  linkedProposalId: string | null;
  description: string;
  items: { id: string; title: string; status: string; assignee?: string; completedAt?: string }[];
  version: number;
  updatedAt: string;
}
interface PendingWrite {
  id: string;
  op: string;
  checklistId: string | null;
  status: string;
  approvalActionId: string;
  via: string;
  requestedBy: string;
  requestedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  closed: "Closed",
};
const ITEM_STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export default function ChecklistsPage() {
  const [items, setItems] = useState<ChecklistSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  // create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"delivery" | "custom">("delivery");
  const [linkedProposalId, setLinkedProposalId] = useState("");
  const [itemsText, setItemsText] = useState("Scope confirmed\nDeliverables drafted\nClient review\nCommissioning");

  const load = useCallback(async () => {
    const res = await fetch("/api/native/checklists", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load checklists");
    const json = await res.json();
    setItems(json.data || []);
    const wr = await fetch("/api/native/checklists/writes", { credentials: "include" });
    if (wr.ok) setWrites((await wr.json()).data || []);
  }, []);

  useEffect(() => {
    load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [load]);

  async function api(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number }> {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { ok: res.ok, status: res.status };
  }

  async function createChecklist() {
    setCreating(true);
    setFeedback("");
    try {
      const itemsRows = itemsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((title) => ({ title, status: "todo" }));
      const body: Record<string, unknown> = { name, description, kind, items: itemsRows };
      if (linkedProposalId.trim()) body.linkedProposalId = linkedProposalId.trim();
      const res = await fetch("/api/native/checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.status === 202) {
        setFeedback("Checklist queued — approve it below to create it.");
      } else if (res.ok) {
        setFeedback("Checklist created.");
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Failed to create checklist");
      }
      setName(""); setDescription(""); setLinkedProposalId("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function action(id: string, verb: string) {
    setFeedback("");
    const res = await api("POST", `/api/native/checklists/${id}/${verb}`);
    if (res.status === 202) setFeedback(`${verb} queued — approve it in the queue below.`);
    else if (res.ok) setFeedback(`${verb} applied.`);
    await load();
  }
  async function applyWrite(id: string) {
    const res = await api("POST", `/api/native/checklists/writes/${id}/apply`);
    setFeedback(res.ok ? "Write applied." : "Write apply failed.");
    await load();
  }
  async function deleteChecklist(id: string) {
    const res = await api("DELETE", `/api/native/checklists/${id}`);
    setFeedback(res.status === 202 ? "Delete queued." : res.ok ? "Deleted." : "Delete failed.");
    await load();
  }
  async function updateItem(id: string, itemId: string, status: string) {
    setFeedback("");
    const c = items.find((x) => x.id === id);
    if (!c) return;
    const nextItems = c.items.map((it) =>
      it.id === itemId ? { ...it, status } : { ...it, id: it.id, title: it.title, status: it.status, ...(it.assignee ? { assignee: it.assignee } : {}) },
    );
    const res = await api("POST", `/api/native/checklists/${id}`, { items: nextItems });
    if (res.status === 202) setFeedback("Item update queued — approve it in the queue below.");
    else if (res.ok) setFeedback("Item updated.");
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Checklists</h1>
          <p className="text-sm text-gray-500">Delivery checklists with approval-gated item tracking.</p>
        </div>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {feedback && <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</div>}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">New checklist</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="rounded border p-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rounded border p-2" placeholder="Linked proposal id (optional, prop_…)" value={linkedProposalId} onChange={(e) => setLinkedProposalId(e.target.value)} />
          <select className="rounded border p-2" value={kind} onChange={(e) => setKind(e.target.value as "delivery" | "custom")}>
            <option value="delivery">Delivery</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <input className="mt-3 w-full rounded border p-2" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <label className="mt-3 block text-sm text-gray-600">Items — one per line (start each with "in_progress:" or "done:" to set status)</label>
        <textarea className="mt-1 w-full rounded border p-2 font-mono text-sm" rows={3} value={itemsText} onChange={(e) => setItemsText(e.target.value)} />
        <Button className="mt-3" onClick={createChecklist} disabled={creating || !name}>
          {creating ? "Creating…" : "Create checklist"}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Checklists ({items.length})</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">No checklists yet — create your first one above.</p>
        ) : (
          <div className="space-y-3">
            {items.map((c) => (
              <div key={c.id} className="rounded border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      <Badge>{STATUS_LABEL[c.status] || c.status}</Badge>
                      <Badge>{c.kind}</Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      {c.progress.done}/{c.progress.total} done · v{c.version}
                      {c.linkedProposalId ? ` · linked ${c.linkedProposalId}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.status === "open" && <Button onClick={() => action(c.id, "close")}>Close</Button>}
                    {c.status === "open" && <Button onClick={() => deleteChecklist(c.id)}>Delete</Button>}
                  </div>
                </div>
                {c.items.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.items.map((it) => (
                      <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-gray-50 p-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium">{it.title}</span>
                          {it.assignee ? <span className="ml-2 text-gray-500">{it.assignee}</span> : null}
                          {it.completedAt ? <span className="ml-2 text-xs text-gray-400">done {new Date(it.completedAt).toLocaleDateString()}</span> : null}
                        </span>
                        <span className="flex items-center gap-1">
                          <Badge>{ITEM_STATUS_LABEL[it.status] || it.status}</Badge>
                          {c.status === "open" && it.status !== "done" && (
                            <Button onClick={() => updateItem(c.id, it.id, "done")}>Mark done</Button>
                          )}
                          {c.status === "open" && it.status === "done" && (
                            <Button onClick={() => updateItem(c.id, it.id, "todo")}>Reopen</Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Pending writes ({writes.filter((w) => w.status === "pending").length})</h2>
        {writes.filter((w) => w.status === "pending").length === 0 ? (
          <p className="text-sm text-gray-500">Nothing waiting for approval.</p>
        ) : (
          <div className="space-y-2">
            {writes.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span className="text-gray-600">
                  <code>{w.op}</code> · {w.via} · {new Date(w.requestedAt).toLocaleString()}
                </span>
                <Button onClick={() => applyWrite(w.id)}>Apply</Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}