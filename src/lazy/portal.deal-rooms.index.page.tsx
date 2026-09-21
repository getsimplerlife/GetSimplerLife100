import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";

interface DealRoomSummary {
  id: string;
  name: string;
  customerName: string;
  customerEmail: string;
  description: string;
  linkedProposalId: string;
  linkedChecklistId: string | null;
  status: string;
  shareSlug: string | null;
  version: number;
  updatedAt: string;
}
interface PendingWrite {
  id: string;
  op: string;
  dealRoomId: string | null;
  status: string;
  approvalActionId: string;
  via: string;
  requestedBy: string;
  requestedAt: string;
}
interface ProposalChoice {
  id: string;
  title: string;
  status: string;
}
interface ChecklistChoice {
  id: string;
  name: string;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

export default function DealRoomsPage() {
  const [items, setItems] = useState<DealRoomSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [proposals, setProposals] = useState<ProposalChoice[]>([]);
  const [checklists, setChecklists] = useState<ChecklistChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  // create form
  const [name, setName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [description, setDescription] = useState("");
  const [linkedProposalId, setLinkedProposalId] = useState("");
  const [linkedChecklistId, setLinkedChecklistId] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/native/dealroom", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load deal rooms");
    const json = await res.json();
    setItems(json.data || []);
    const wr = await fetch("/api/native/dealroom/writes", { credentials: "include" });
    if (wr.ok) setWrites((await wr.json()).data || []);
    const pr = await fetch("/api/native/proposals", { credentials: "include" });
    if (pr.ok) {
      const pj = await pr.json();
      setProposals((pj.data || []).map((p: { id: string; title: string; status: string }) => ({ id: p.id, title: p.title, status: p.status })));
    }
    const ch = await fetch("/api/native/checklists", { credentials: "include" });
    if (ch.ok) {
      const cj = await ch.json();
      setChecklists((cj.data || []).map((c: { id: string; name: string; status: string }) => ({ id: c.id, name: c.name, status: c.status })));
    }
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

  async function createDealRoom() {
    setCreating(true);
    setFeedback("");
    try {
      const body: Record<string, unknown> = { name, customerName, customerEmail, description, linkedProposalId };
      if (linkedChecklistId.trim()) body.linkedChecklistId = linkedChecklistId.trim();
      const res = await fetch("/api/native/dealroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.status === 202) {
        setFeedback("Deal room queued — approve it below to create it.");
      } else if (res.ok) {
        setFeedback("Deal room created.");
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Failed to create deal room");
      }
      setName(""); setCustomerName(""); setCustomerEmail(""); setDescription(""); setLinkedProposalId(""); setLinkedChecklistId("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function action(id: string, verb: string) {
    setFeedback("");
    setError("");
    const res = await fetch(`/api/native/dealroom/${id}/${verb}`, { method: "POST", credentials: "include" });
    if (res.status === 202) setFeedback(`${verb} queued — approve it in the queue below.`);
    else if (res.ok) setFeedback(`${verb} applied.`);
    else {
      const j = await res.json().catch(() => ({}));
      if (j.error) setError(j.error);
    }
    await load();
  }
  async function applyWrite(id: string) {
    const res = await api("POST", `/api/native/dealroom/writes/${id}/apply`);
    setFeedback(res.ok ? "Write applied." : "Write apply failed.");
    await load();
  }
  async function deleteDealRoom(id: string) {
    const res = await api("DELETE", `/api/native/dealroom/${id}`);
    setFeedback(res.status === 202 ? "Delete queued." : res.ok ? "Deleted." : "Delete failed.");
    await load();
  }
  async function activate(id: string) {
    setFeedback("");
    setError("");
    const res = await fetch(`/api/native/dealroom/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status: "active" }),
    });
    if (res.status === 202) setFeedback("Activate queued — approve it in the queue below.");
    else if (res.ok) setFeedback("Deal room activated.");
    else {
      const j = await res.json().catch(() => ({}));
      if (j.error) setError(j.error);
    }
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deal rooms</h1>
          <p className="text-sm text-gray-500">Per-customer document rooms tying the approved proposal to delivery.</p>
        </div>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {feedback && <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</div>}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">New deal room</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="rounded border p-2" placeholder="Deal room name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="rounded border p-2" placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <input className="rounded border p-2" placeholder="Customer email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          <select className="rounded border p-2" value={linkedProposalId} onChange={(e) => setLinkedProposalId(e.target.value)}>
            <option value="">Link a proposal (required)</option>
            {proposals.map((p) => (
              <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
            ))}
          </select>
          <select className="rounded border p-2" value={linkedChecklistId} onChange={(e) => setLinkedChecklistId(e.target.value)}>
            <option value="">Link a checklist (optional)</option>
            {checklists.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
            ))}
          </select>
        </div>
        <input className="mt-3 w-full rounded border p-2" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Button className="mt-3" onClick={createDealRoom} disabled={creating || !name || !customerName || !customerEmail || !linkedProposalId}>
          {creating ? "Creating…" : "Create deal room"}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Deal rooms ({items.length})</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">No deal rooms yet — create your first one above.</p>
        ) : (
          <div className="space-y-3">
            {items.map((d) => (
              <div key={d.id} className="rounded border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{d.name}</span>
                      <Badge>{STATUS_LABEL[d.status] || d.status}</Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      {d.customerName} · {d.customerEmail} · v{d.version}
                    </p>
                    <p className="text-xs text-gray-400">
                      proposal {d.linkedProposalId}
                      {d.linkedChecklistId ? ` · checklist ${d.linkedChecklistId}` : ""}
                    </p>
                    {d.shareSlug ? (
                      <p className="text-xs text-sky-600">Customer view: /deal-rooms/share/{d.shareSlug}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {d.status === "draft" && <Button onClick={() => activate(d.id)}>Activate</Button>}
                    {d.status !== "archived" && <Button onClick={() => action(d.id, "archive")}>Archive</Button>}
                    <Button onClick={() => deleteDealRoom(d.id)}>Delete</Button>
                  </div>
                </div>
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