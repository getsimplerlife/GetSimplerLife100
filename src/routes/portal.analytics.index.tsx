import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/analytics/")({
  component: PerformanceAnalytics,
});

function PerformanceAnalytics() {
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/analytics", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
      setAnalytics(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (action: string) => {
    try {
      setFeedback(`Processing performance query: ${action}...`);
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "analytics_" + action.toLowerCase() }),
      });
      setFeedback("Success: Filter applied");
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
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
    <div className="space-y-8 font-sans">
      <div className="border-b border-stone-200 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">📈 Performance Analytics</h1>
          <p className="text-stone-500 mt-1">Deep dive metrics, resource utilization, SLA accuracy compliance, and productivity charts.</p>
        </div>
        <button onClick={() => handleAction("filter")} className="bg-white border border-stone-200 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-sm">📅 Filter Range</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {analytics.map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-all">
            <span className="text-[10px] font-black text-stone-400 uppercase block mb-1">{stat.name}</span>
            <div className="text-3xl font-black text-stone-900">{stat.value}</div>
          </div>
        ))}
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