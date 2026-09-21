import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";

interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  linkedDealRoomId: string;
  currency: string;
  amountDueCents: number;
  status: string;
  docId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}
interface DealRoomChoice {
  id: string;
  name: string;
  status: string;
}
interface PendingWrite {
  id: string;
  op: string;
  invoiceId: string | null;
  status: string;
  approvalActionId: string;
  via: string;
  requestedBy: string;
  requestedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
};

function money(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export default function InvoicesPage() {
  const [items, setItems] = useState<InvoiceSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [dealRooms, setDealRooms] = useState<DealRoomChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  const [dealRoomId, setDealRoomId] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/native/invoice", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load invoices");
    const json = await res.json();
    setItems(json.data || []);
    const wr = await fetch("/api/native/invoice/writes", { credentials: "include" });
    if (wr.ok) setWrites((await wr.json()).data || []);
    const dr = await fetch("/api/native/dealroom", { credentials: "include" });
    if (dr.ok) {
      const dj = await dr.json();
      setDealRooms((dj.data || []).filter((d: { status: string }) => d.status === "active"));
    }
  }, []);

  useEffect(() => {
    load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [load]);

  async function createInvoice() {
    setCreating(true);
    setFeedback("");
    setError("");
    if (!dealRoomId) {
      setError("Pick a deal room to invoice first.");
      setCreating(false);
      return;
    }
    try {
      const res = await fetch("/api/native/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ linkedDealRoomId: dealRoomId }),
      });
      if (res.status === 202) setFeedback("Invoice queued — approve it in the queue below.");
      else if (res.ok) setFeedback("Invoice created as draft.");
      else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Failed to create invoice");
      }
      setDealRoomId("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function verb(id: string, action: "generate" | "send" | "delete") {
    setFeedback("");
    setError("");
    const res = await fetch(`/api/native/invoice/${id}${action === "delete" ? "" : `/${action}`}`, {
      method: action === "delete" ? "DELETE" : "POST",
      credentials: "include",
    });
    if (res.status === 202) setFeedback(`${action} queued — approve it in the queue below.`);
    else if (res.ok) setFeedback(`${action} applied.`);
    else {
      const j = await res.json().catch(() => ({}));
      if (j.error) setError(j.error);
    }
    await load();
  }
  async function applyWrite(id: string) {
    const res = await fetch(`/api/native/invoice/writes/${id}/apply`, { method: "POST", credentials: "include" });
    setFeedback(res.ok ? "Write applied." : "Write apply failed.");
    await load();
  }

  const visible = filter ? items.filter((i) => i.linkedDealRoomId === filter) : items;
  const dealName = (id: string) => dealRooms.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-gray-500">Native invoices built from approved deal rooms. Posting to the customer's books stays with the connected accounting adapter (Xero/QuickBooks).</p>
        </div>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {feedback && <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</div>}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Create invoice from a deal room</h2>
        <div className="flex flex-wrap items-end gap-3">
          <select className="min-w-64 rounded border p-2" value={dealRoomId} onChange={(e) => setDealRoomId(e.target.value)}>
            <option value="">Pick an active deal room</option>
            {dealRooms.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <Button onClick={createInvoice} disabled={creating || !dealRoomId}>
            {creating ? "Creating…" : "Create invoice"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Line items are snapshotted from the deal room's linked proposal (integer cents); the amount can only change through a new proposal revision.</p>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Invoices ({visible.length})</h2>
        <select className="mb-3 rounded border p-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All deal rooms</option>
          {dealRooms.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500">No invoices yet — create one from an active deal room above.</p>
        ) : (
          <div className="space-y-3">
            {visible.map((i) => (
              <div key={i.id} className="rounded border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{i.invoiceNumber}</span>
                      <Badge>{STATUS_LABEL[i.status] || i.status}</Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      {dealName(i.linkedDealRoomId)} · {money(i.amountDueCents, i.currency)} · v{i.version}
                    </p>
                    <p className="text-xs text-gray-400">
                      {i.docId ? "PDF on file" : "No PDF yet"} · issued {new Date(i.createdAt).toLocaleDateString()}
                      {i.sentAt ? ` · sent ${new Date(i.sentAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {i.status === "draft" && <Button onClick={() => verb(i.id, "generate")}>Generate PDF</Button>}
                    {i.status === "draft" && <Button onClick={() => verb(i.id, "send")}>Mark sent</Button>}
                    {i.status === "draft" && <Button onClick={() => verb(i.id, "delete")}>Delete</Button>}
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