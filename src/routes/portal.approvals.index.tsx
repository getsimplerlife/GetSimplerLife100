import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/approvals/")({
  component: HumanApprovalCenter,
});

function HumanApprovalCenter() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/approvals", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setApprovals(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (id: string, action: string) => {
    try {
      setFeedback("Processing approval action: " + action + "...");
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "approval_" + action.toLowerCase(), resource: id }),
      });
      // Delete the record from DB and local state
      const target = approvals.find(a => a.id === id || a._id === id);
      if (target && target._id) {
        await fetch("/api/data/approvals/" + target._id, { method: "DELETE", credentials: "include" });
      }
      setApprovals(approvals.filter(a => a.id !== id && a._id !== id));
      setFeedback("Success: " + action + " processed");
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div>Loading Approvals Queue...</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-stone-200 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">✅ Human Approval Center</h1>
          <p className="text-stone-500 mt-1">Review decisions flagged by autonomous agents that fall below threshold confidence bounds.</p>
        </div>
      </div>

      {approvals.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-3xl border border-stone-200 shadow-sm max-w-md mx-auto">
          <span className="text-4xl">🎉</span>
          <h3 className="text-md font-bold mt-4 text-stone-800">All Clear!</h3>
          <p className="text-xs text-stone-400 mt-1">No items require human intervention currently.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {approvals.map((app) => (
            <div key={app.id || app._id} className="bg-white rounded-3xl border border-stone-200 shadow-sm p-6 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-mono text-stone-400">{app.id || "APP-PENDING"}</span>
                  <span className="font-bold text-emerald-600">{app.confidenceScore}% Confidence</span>
                </div>
                <h3 className="font-black text-stone-900 text-sm leading-snug">{app.type}</h3>
                <div className="bg-stone-50 p-3 rounded-xl border border-stone-150 text-stone-600 text-xs">
                  <strong>Suggested:</strong> {app.suggestedDecision}
                </div>
                <div className="text-stone-400 text-[10px] italic">"{app.comments}"</div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-stone-100 pt-4">
                <button
                  onClick={() => handleAction(app.id || app._id, "Approve")}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(app.id || app._id, "Reject")}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 font-bold py-2 rounded-xl text-xs"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}