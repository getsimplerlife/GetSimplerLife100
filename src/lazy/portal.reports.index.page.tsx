import { useState, useEffect } from "react";
import { PortalEmptyState } from "~/components/PortalEmptyState";



function ReportsCenter() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/reports", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setReports(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (name: string, action: string) => {
    try {
      const res = await fetch("/api/data/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "report_" + action.toLowerCase(), resource: name }),
      });
      setFeedback(
        res.ok
          ? `Request logged for "${name}" — ${action} is not executed from this workspace yet.`
          : "Request failed — try again.",
      );
      setTimeout(() => setFeedback(""), 4000);
    } catch (err) {
      console.error(err);
      setFeedback("Request failed — try again.");
      setTimeout(() => setFeedback(""), 4000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-stone-800 pb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-stone-100 tracking-tight">📊 Analytics Reports</h1>
          <p className="text-stone-400 mt-1">Download auto-generated operational and financial reports.</p>
        </div>
        <button
          onClick={() => handleAction("On-demand Report", "generate")}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-2xl"
        >
          ⚙️ Generate New Report
        </button>
      </div>

      <div className="bg-stone-900 rounded-3xl border border-stone-800 overflow-hidden">
        {reports.length === 0 ? (
          <div className="p-8">
            <PortalEmptyState
              title="No reports yet"
              body="Reports appear here once they're generated. Use Generate New Report above to request your first one — the request is logged for your workspace."
            />
          </div>
        ) : (
        <table className="w-full text-left text-xs font-semibold">
          <thead>
            <tr className="bg-stone-800 text-stone-400 border-b border-stone-800 uppercase tracking-wider">
              <th className="p-4 font-bold">Report Name</th>
              <th className="p-4 font-bold">Type</th>
              <th className="p-4 font-bold">Frequency</th>
              <th className="p-4 font-bold">Format</th>
              <th className="p-4 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-800 font-semibold text-stone-300">
            {reports.map((rep, idx) => (
              <tr key={idx} className="hover:bg-stone-800/40">
                <td className="p-4 font-black text-stone-100">{rep.name}</td>
                <td className="p-4">{rep.type}</td>
                <td className="p-4">{rep.frequency}</td>
                <td className="p-4">{rep.format}</td>
                <td className="p-4 text-right">
                  <button onClick={() => handleAction(rep.name, "download")} className="text-emerald-400">Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}

export default ReportsCenter;
