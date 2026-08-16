import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Card, Badge, Button, Modal } from "~/components/ui";
export const Route = createFileRoute("/portal/approvals/")({
  component: ApprovalQueue,
});

/** Mirrors src/lib/approval-queue.ts PendingAction (portal-safe shape). */
interface ApprovalAction {
  actionId: string;
  tenantEmail: string;
  agentId: string;
  actionType: string;
  provider: string;
  summary: { what: string; where: string; why: string };
  payload: Record<string, any>;
  status: "pending" | "approved" | "rejected" | "edited";
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
  result?: any;
  resultError?: string;
}

const PROVIDER_LABEL: Record<string, string> = {
  xero: "Xero",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  "google-workspace": "Google Workspace",
  microsoft: "Microsoft 365",
  slack: "Slack",
  docusign: "DocuSign",
  onfleet: "Onfleet",
  tableau: "Tableau",
  workday: "Workday",
  coupa: "Coupa",
  quickbooks: "QuickBooks",
  servicenow: "ServiceNow",
  jira: "Jira",
  zendesk: "Zendesk",
  shopify: "Shopify",
};

function providerName(id: string): string {
  return PROVIDER_LABEL[id] || id;
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ApprovalQueue() {
  const [pending, setPending] = useState<ApprovalAction[]>([]);
  const [decided, setDecided] = useState<ApprovalAction[]>([]);
  const [mode, setMode] = useState<"on" | "auto">("on");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ApprovalAction | null>(null);
  const [editPayload, setEditPayload] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/approvals", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load approvals");
      const json = await res.json();
      setPending(json.data?.pending || []);
      setDecided(json.data?.decided || []);
      setMode(json.data?.mode || "on");
    } catch (e: any) {
      setError(e?.message || "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(""), 3200);
  };

  const decide = async (actionId: string, decision: "approve" | "reject", payload?: Record<string, any>) => {
    setBusyId(actionId);
    setError("");
    try {
      const res = await fetch("/api/portal/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload !== undefined ? { actionId, decision, payload } : { actionId, decision }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Request failed");
      if (decision === "approve") {
        if (json.data?.execution?.success) flash("✅ Approved — executed");
        else flash(json.data?.execution?.error ? `⚠️ Approved but execution failed: ${json.data.execution.error}` : "✅ Approved");
      } else {
        flash("🗑️ Rejected — no provider call was made");
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Request failed");
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = (a: ApprovalAction) => {
    setEditing(a);
    setEditPayload(JSON.stringify(a.payload || {}, null, 2));
  };

  const submitEditAndApprove = async () => {
    if (!editing) return;
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(editPayload);
    } catch {
      setError("Edited payload is not valid JSON");
      return;
    }
    await decide(editing.actionId, "approve", payload);
  };

  const toggleMode = async () => {
    const next = mode === "on" ? "auto" : "on";
    try {
      const res = await fetch("/api/portal/approvals/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update mode");
      setMode(next);
      flash(next === "auto" ? "Auto-approve ON — writes will execute without review" : "Approvals ON — writes wait for your review");
    } catch (e: any) {
      setError(e?.message || "Failed to update mode");
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-stone-200 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">✅ Approval Queue</h1>
          <p className="text-stone-500 mt-1">
            Every AI write action waits here for your approval. Nothing executes until you say so.
          </p>
        </div>
        <button
          onClick={toggleMode}
          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
            mode === "on"
              ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
              : "bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200"
          }`}
        >
          {mode === "on" ? "🛡️ Approvals ON — writes wait for review" : "⚡ Auto-approve ON — writes execute immediately"}
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Pending */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black text-stone-800 uppercase tracking-wide">Pending ({pending.length})</h2>
          <Badge variant={pending.length > 0 ? "warning" : "emerald"}>
            {pending.length === 0 ? "All clear" : `${pending.length} awaiting review`}
          </Badge>
        </div>
        {pending.length === 0 ? (
          <Card className="p-12 text-center">
            <span className="text-4xl">🎉</span>
            <h3 className="text-md font-bold mt-4 text-stone-800">All Clear!</h3>
            <p className="text-xs text-stone-400 mt-1">No agent writes are waiting for approval.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pending.map((a) => (
              <Card key={a.actionId} className="p-6 flex flex-col justify-between gap-5">
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-mono text-stone-400">{a.actionId.slice(0, 14)}…</span>
                    <Badge variant="warning">{providerName(a.provider)}</Badge>
                  </div>
                  <h3 className="font-black text-stone-900 text-sm leading-snug break-all">{a.actionType}</h3>
                  <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-xs space-y-1.5">
                    <div><strong className="text-stone-700">Where:</strong> <span className="text-stone-600">{a.summary.where}</span></div>
                    <div><strong className="text-stone-700">What:</strong> <span className="text-stone-600 break-all">{a.summary.what}</span></div>
                    <div><strong className="text-stone-700">Why:</strong> <span className="text-stone-600">{a.summary.why}</span></div>
                    <div className="pt-1 text-stone-400 text-[10px]">
                      Agent <span className="font-mono">{a.agentId}</span> · {timeAgo(a.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-stone-100 pt-4">
                  <button
                    onClick={() => decide(a.actionId, "approve")}
                    disabled={busyId === a.actionId}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs"
                  >
                    {busyId === a.actionId ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => openEdit(a)}
                    disabled={busyId === a.actionId}
                    className="bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 border border-stone-200 font-bold py-2 rounded-xl text-xs"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => decide(a.actionId, "reject")}
                    disabled={busyId === a.actionId}
                    className="bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 border border-rose-100 font-bold py-2 rounded-xl text-xs"
                  >
                    {busyId === a.actionId ? "…" : "Reject"}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Decided audit trail */}
      {decided.length > 0 && (
        <section>
          <h2 className="text-sm font-black text-stone-800 uppercase tracking-wide mb-4">Decided ({decided.length})</h2>
          <Card className="divide-y divide-stone-100">
            {decided.slice(0, 20).map((a) => (
              <div key={a.actionId} className="flex items-center justify-between gap-4 py-3 px-4 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-stone-800 truncate">{a.actionType}</div>
                  <div className="text-stone-400 truncate">
                    {providerName(a.provider)} · decided {timeAgo(a.decidedAt || 0)}{a.decidedBy ? ` by ${a.decidedBy}` : ""}
                  </div>
                  {a.resultError && <div className="text-rose-500 truncate mt-0.5">{a.resultError}</div>}
                </div>
                <Badge variant={a.status === "approved" ? "emerald" : a.status === "rejected" ? "danger" : "stone"}>
                  {a.status}
                </Badge>
              </div>
            ))}
          </Card>
        </section>
      )}

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

      {/* Edit + Approve modal */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit payload then approve">
        {editing && (
          <div className="space-y-4">
            <div className="text-xs text-stone-500">
              Editing <strong className="font-mono text-stone-800">{editing.actionType}</strong> in{" "}
              <strong>{providerName(editing.provider)}</strong>. The edited payload is what executes on approve.
            </div>
            <textarea
              value={editPayload}
              onChange={(e) => setEditPayload(e.target.value)}
              rows={10}
              className="w-full font-mono text-xs bg-stone-50 border border-stone-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              spellCheck={false}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={submitEditAndApprove}>Approve with edits</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
