import { useState, useEffect, useCallback } from "react";
import { Card, Badge, Button, Modal } from "~/components/ui";


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

/**
 * SLICE 198 — a card's state comes from WHAT HAPPENED, not from the decision.
 *
 * The sweep (P1-2) found five cards wearing a green `APPROVED` badge directly
 * above a red failure line: the badge read `status`, and `status` records that a
 * human decided, not that the write ran. A decision that failed to execute is
 * `failed` — red — and this is the ONE place that mapping lives, so the page and
 * its test cannot disagree about it.
 */
export type DecisionState = "applied" | "failed" | "rejected" | "pending";

export function decisionState(a: {
  status: ApprovalAction["status"];
  resultError?: string;
}): { state: DecisionState; label: string; variant: "emerald" | "danger" | "stone" | "warning" } {
  if (a.status === "rejected") return { state: "rejected", label: "rejected", variant: "stone" };
  if (a.status === "approved") {
    return a.resultError
      ? { state: "failed", label: "failed", variant: "danger" }
      : { state: "applied", label: "applied", variant: "emerald" };
  }
  return { state: "pending", label: a.status, variant: "warning" };
}

function ApprovalQueue() {
  const [pending, setPending] = useState<ApprovalAction[]>([]);
  const [decided, setDecided] = useState<ApprovalAction[]>([]);
  const [mode, setMode] = useState<"on" | "auto">("on");
  const [loading, setLoading] = useState(true);
  // SLICE 188 — the money path. `pending` is [] both when nothing is queued and
  // when the queue could not be read; `loaded` is the only thing that separates
  // "All clear" from "no answer", and this is the one page where confusing the
  // two is unforgivable.
  const [loaded, setLoaded] = useState(false);
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
      setLoaded(true);
    } catch (e: any) {
      setError(e?.message || "Failed to load approvals");
      setLoaded(false);
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
      flash(
        next === "auto"
          ? "Auto-approve requested — only allow-listed automations run without review; everything else still waits"
          : "Approvals ON — writes wait for your review",
      );
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
      <div className="border-b border-stone-800 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-100 tracking-tight">✅ Approval Queue</h1>
          <p className="text-stone-500 mt-1">
            Every AI write action waits here for your approval. Nothing executes until you say so.
          </p>
        </div>
        <button
          onClick={toggleMode}
          className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
            mode === "on"
              ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
              : "bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700"
          }`}
        >
          {mode === "on"
            ? "🛡️ Approvals ON — writes wait for review"
            : "⚡ Auto-approve requested — only allow-listed automations run without review"}
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
          <h2 className="text-sm font-black text-stone-100 uppercase tracking-wide">
            Pending ({loaded ? pending.length : "—"})
          </h2>
          <Badge variant={!loaded ? "danger" : pending.length > 0 ? "warning" : "emerald"}>
            {!loaded ? "Not read" : pending.length === 0 ? "All clear" : `${pending.length} awaiting review`}
          </Badge>
        </div>
        {/* SLICE 188 — `loaded` gates the affirmative state. A queue that could
            not be read is NOT an empty queue: before this gate the page printed
            "🎉 All Clear! No agent writes are waiting for approval." over an
            approvals array that had never been read. */}
        {!loaded ? (
          <Card className="p-12 text-center">
            <span className="text-4xl">⚠️</span>
            <h3 className="text-md font-bold mt-4 text-stone-100">The approval queue could not be read</h3>
            <p className="text-xs text-stone-400 mt-1 max-w-md mx-auto leading-relaxed">
              {error || "The read did not answer."} This is not an empty queue — it is an unread one. Do not treat
              pending writes as approved.
            </p>
            <button
              onClick={() => void load()}
              className="mt-4 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 font-bold py-2 px-4 rounded-xl text-xs"
            >
              Retry →
            </button>
          </Card>
        ) : pending.length === 0 ? (
          <Card className="p-12 text-center">
            <span className="text-4xl">🎉</span>
            <h3 className="text-md font-bold mt-4 text-stone-100">All Clear!</h3>
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
                  <h3 className="font-black text-stone-100 text-sm leading-snug break-all">{a.actionType}</h3>
                  <div className="bg-stone-50 p-3 rounded-xl border border-stone-800 text-xs space-y-1.5">
                    <div><strong className="text-stone-700">Where:</strong> <span className="text-stone-600">{a.summary.where}</span></div>
                    <div><strong className="text-stone-700">What:</strong> <span className="text-stone-600 break-all">{a.summary.what}</span></div>
                    <div><strong className="text-stone-700">Why:</strong> <span className="text-stone-600">{a.summary.why}</span></div>
                    <div className="pt-1 text-stone-400 text-[10px]">
                      Agent <span className="font-mono">{a.agentId}</span> · {timeAgo(a.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-stone-800 pt-4">
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
                    className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-200 border border-stone-700 font-bold py-2 rounded-xl text-xs"
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
          <h2 className="text-sm font-black text-stone-100 uppercase tracking-wide mb-4">Decided ({decided.length})</h2>
          <Card className="divide-y divide-stone-100">
            {decided.slice(0, 20).map((a) => (
              <div key={a.actionId} className="flex items-center justify-between gap-4 py-3 px-4 text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-stone-100 truncate">{a.actionType}</div>
                  <div className="text-stone-400 truncate">
                    {providerName(a.provider)} · decided {timeAgo(a.decidedAt || 0)}{a.decidedBy ? ` by ${a.decidedBy}` : ""}
                  </div>
                  {a.resultError && <div className="text-rose-500 truncate mt-0.5">{a.resultError}</div>}
                </div>
                {/* SLICE 198 — the badge reports the OUTCOME. A card whose write
                    failed says `failed` in red; it never wears the success colour
                    just because a human said yes. */}
                <Badge variant={decisionState(a).variant}>{decisionState(a).label}</Badge>
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
              Editing <strong className="font-mono text-stone-100">{editing.actionType}</strong> in{" "}
              <strong>{providerName(editing.provider)}</strong>. The edited payload is what executes on approve.
            </div>
            <textarea
              value={editPayload}
              onChange={(e) => setEditPayload(e.target.value)}
              rows={10}
              className="w-full font-mono text-xs bg-stone-50 border border-stone-800 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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

export default ApprovalQueue;
