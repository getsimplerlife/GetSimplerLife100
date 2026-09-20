import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button } from "~/components/ui";

interface ProposalSummary {
  id: string;
  title: string;
  clientName: string;
  clientCompany: string;
  status: string;
  currency: string;
  total: string;
  validityDays: number;
  version: number;
  hasPdf: boolean;
  shareUrl: string | null;
  updatedAt: string;
}
interface PendingWrite {
  id: string;
  op: string;
  proposalId: string | null;
  status: string;
  approvalActionId: string;
  via: string;
  requestedBy: string;
  requestedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending client review",
  approved: "Approved",
  rejected: "Rejected",
  sent: "Sent",
};

export default function ProposalsPage() {
  const [items, setItems] = useState<ProposalSummary[]>([]);
  const [writes, setWrites] = useState<PendingWrite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [creating, setCreating] = useState(false);
  const [clip, setClip] = useState("");
  // create form
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [terms, setTerms] = useState("Net 30");
  const [validityDays, setValidityDays] = useState(30);
  const [lineItemsText, setLineItemsText] = useState("Discovery workshop | 2 | 49.99\nIntegration setup | 1 | 500.00");

  const load = useCallback(async () => {
    const res = await fetch("/api/native/proposals", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load proposals");
    const json = await res.json();
    setItems(json.data || []);
    const wr = await fetch("/api/native/proposals/writes", { credentials: "include" });
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

  async function createProposal() {
    setCreating(true);
    setFeedback("");
    try {
      const itemsRows = lineItemsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [description, qty, unitPrice] = l.split("|").map((x) => x.trim());
          return { description, qty: Number(qty), unitPrice: Number(unitPrice) };
        });
      const res = await fetch("/api/native/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          clientName,
          clientEmail,
          clientCompany,
          terms,
          validityDays,
          lineItems: itemsRows,
          currency: "USD",
        }),
      });
      if (res.status === 202) {
        setFeedback("Draft queued — approve it below to create the proposal.");
      } else if (res.ok) {
        setFeedback("Proposal created.");
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Failed to create proposal");
      }
      setTitle(""); setClientName(""); setClientEmail(""); setClientCompany("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function action(id: string, verb: string) {
    setFeedback("");
    const res = await api("POST", `/api/native/proposals/${id}/${verb}`);
    if (res.status === 202) setFeedback(`${verb} queued — approve it in the queue below.`);
    else if (res.ok) setFeedback(`${verb} applied.`);
    await load();
  }
  async function applyWrite(id: string) {
    const res = await api("POST", `/api/native/proposals/writes/${id}/apply`);
    setFeedback(res.ok ? "Write applied." : "Write apply failed.");
    await load();
  }
  async function deleteProposal(id: string) {
    const res = await api("DELETE", `/api/native/proposals/${id}`);
    setFeedback(res.status === 202 ? "Delete queued." : res.ok ? "Deleted." : "Delete failed.");
    await load();
  }

  async function copyShare(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setClip("Copied — share this link with the client.");
    } catch {
      setClip(url);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proposals</h1>
          <p className="text-sm text-gray-500">Draft, share, and track proposals. Every write is approval-gated.</p>
        </div>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {feedback && <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</div>}
      {clip && <div className="rounded border border-sky-300 bg-sky-50 p-3 text-sm text-sky-800 break-all">{clip}</div>}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">New proposal</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="rounded border p-2" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="rounded border p-2" placeholder="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          <input className="rounded border p-2" placeholder="Client email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
          <input className="rounded border p-2" placeholder="Client company" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} />
          <input className="rounded border p-2" placeholder="Terms (e.g. Net 30)" value={terms} onChange={(e) => setTerms(e.target.value)} />
          <input
            className="rounded border p-2"
            placeholder="Valid for (days)"
            type="number"
            value={String(validityDays)}
            onChange={(e) => setValidityDays(Number(e.target.value))}
          />
        </div>
        <label className="mt-3 block text-sm text-gray-600">Line items — one per line: description | qty | unit price</label>
        <textarea className="mt-1 w-full rounded border p-2 font-mono text-sm" rows={3} value={lineItemsText} onChange={(e) => setLineItemsText(e.target.value)} />
        <Button className="mt-3" onClick={createProposal} disabled={creating || !title || !clientName}>
          {creating ? "Creating…" : "Create draft"}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Open proposals ({items.length})</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">No proposals yet — create your first draft above.</p>
        ) : (
          <div className="space-y-3">
            {items.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <Badge>{STATUS_LABEL[p.status] || p.status}</Badge>
                  </div>
                  <p className="text-sm text-gray-500">
                    {p.clientName}{p.clientCompany ? ` — ${p.clientCompany}` : ""} · {p.total} · v{p.version}
                  </p>
                  {p.shareUrl && (
                    <button className="mt-1 text-left text-xs text-sky-600 underline break-all" onClick={() => copyShare(p.shareUrl!)}>
                      Share link
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.status === "draft" && <Button onClick={() => action(p.id, "open")}>Open</Button>}
                  {p.status === "pending" && (
                    <>
                      <Button onClick={() => action(p.id, "approve")}>Approve</Button>
                      <Button onClick={() => action(p.id, "reject")}>Reject</Button>
                    </>
                  )}
                  {p.status === "approved" && <Button onClick={() => action(p.id, "send")}>Send</Button>}
                  {p.hasPdf && (
                    <a className="inline-flex items-center rounded border p-2 text-sm" href={`/api/native/proposals/${p.id}/pdf`}>
                      PDF
                    </a>
                  )}
                  {(p.status === "draft" || p.status === "pending") && <Button onClick={() => deleteProposal(p.id)}>Delete</Button>}
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