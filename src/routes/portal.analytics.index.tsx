import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/analytics/")({
  component: PerformanceAnalytics,
});

interface AnalyticsMetric {
  id: string;
  name: string;
  value: string;
  subtext: string;
  trend: string;
  trendType: "up" | "down" | "neutral";
  category: "executive" | "coworker" | "bottleneck";
}

interface DepartmentShare {
  name: string;
  percentage: number;
  hours: number;
  color: string;
}

function PerformanceAnalytics() {
  const [metrics, setMetrics] = useState<AnalyticsMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "executive" | "coworker" | "bottleneck">("all");

  const departments: DepartmentShare[] = [
    { name: "Finance Operations", percentage: 38, hours: 179.5, color: "bg-blue-500" },
    { name: "Sales Outreach", percentage: 22, hours: 104.0, color: "bg-purple-500" },
    { name: "Customer Support", percentage: 18, hours: 85.0, color: "bg-emerald-500" },
    { name: "Logistics & Dispatch", percentage: 14, hours: 66.2, color: "bg-amber-500" },
    { name: "HR Compliance", percentage: 8, hours: 37.8, color: "bg-stone-700" }
  ];

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/data/analytics", { credentials: "include" });
        const d = await res.json();
        
        if (d.data && d.data.length > 0) {
          setMetrics(d.data);
        } else {
          setMetrics([]);
        }
        setLoading(false);
      } catch (err) {
        console.error("Analytics fetch error:", err);
        setMetrics([]);
        setLoading(false);
      }
    })();
  }, []);

  const handleAction = async (action: string) => {
    try {
      setFeedback(`Re-generating calculations...`);
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "analytics_" + action.toLowerCase() }),
      });
      setFeedback(`Success: Performance data refreshed`);
      setTimeout(() => setFeedback(""), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredMetrics = metrics.filter((m) => activeTab === "all" || m.category === activeTab);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-850 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Calculating Metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto text-stone-100 select-none">
      
      {/* ─── Header ─── */}
      <div className="border-b border-stone-900 pb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">📈 Executive Analytics</h1>
          <p className="text-stone-400 text-xs mt-1">
            Real-time telemetry, automated labor audits, ROI trackers, and bottleneck indicators.
          </p>
        </div>
        <button
          onClick={() => handleAction("refresh")}
          className="bg-stone-900 hover:bg-stone-850 text-stone-300 hover:text-white border border-stone-800 text-xs font-mono font-bold px-4 py-2.5 rounded-xl transition-all self-start md:self-auto"
        >
          🔄 Refresh Metrics
        </button>
      </div>

      {metrics.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 py-16 bg-stone-950 border border-stone-900 rounded-2xl max-w-xl mx-auto my-8">
          <div className="text-4xl mb-4">📈</div>
          <h3 className="text-lg font-bold text-white mb-2">No analytics telemetry yet</h3>
          <p className="text-sm text-stone-400 mb-6 max-w-sm leading-relaxed">
            Labor audits, predicted savings, ROI charts, and model execution telemetry will populate automatically once your first AI employee is deployed.
          </p>
          <Link
            to="/portal/billing"
            className="inline-flex items-center justify-center bg-white hover:bg-stone-100 text-black font-extrabold px-6 py-3 rounded-xl transition-all font-mono text-xs shadow-lg shadow-white/5 active:scale-95"
          >
            Deploy an AI Employee
          </Link>
        </div>
      ) : (
        <>
          {/* ─── Tabs Filter bar ─── */}
          <div className="flex gap-2">
        {(["all", "executive", "coworker", "bottleneck"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
              activeTab === tab
                ? "bg-white text-black font-black"
                : "bg-stone-900/60 text-stone-400 hover:text-stone-200"
            }`}
          >
            {tab === "all" ? "All Statistics" : `${tab} indicators`}
          </button>
        ))}
      </div>

      {/* ─── Executive Metrics Cards Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMetrics.map((itm) => (
          <div
            key={itm.id}
            className="bg-stone-950 border border-stone-900 rounded-xl p-6 flex flex-col justify-between space-y-6 hover:shadow-lg transition-all"
          >
            <div className="space-y-2">
              <span className="text-[9px] font-mono tracking-wider uppercase text-stone-500 block">
                {itm.name}
              </span>
              <div className="text-3xl font-black text-white tracking-tight font-sans">
                {itm.value}
              </div>
              <p className="text-[10px] text-stone-400 font-semibold leading-relaxed">
                {itm.subtext}
              </p>
            </div>

            <div className="border-t border-stone-900/80 pt-3 flex items-center justify-between">
              <span className="text-[9px] font-mono text-stone-500 uppercase">Trend Matrix</span>
              <span className={`text-[10px] font-mono font-black ${
                itm.trendType === "up" ? "text-emerald-500" :
                itm.trendType === "down" ? "text-rose-500 animate-pulse" : "text-stone-400"
              }`}>
                {itm.trend}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Segmented Department Share Breakdown ─── */}
      <div className="bg-stone-950 border border-stone-900 p-6 rounded-2xl space-y-6">
        <div>
          <h2 className="text-lg font-black text-white">Labor Allocation Share</h2>
          <p className="text-stone-500 text-xs mt-1">Cumulative labor hours saved mapped directly to specialized enterprise divisions.</p>
        </div>

        {/* Minimal segmented progress bar segment */}
        <div className="h-4 w-full bg-stone-900 rounded-full overflow-hidden flex">
          {departments.map((dep) => (
            <div
              key={dep.name}
              className={`${dep.color} h-full transition-all`}
              style={{ width: `${dep.percentage}%` }}
              title={`${dep.name}: ${dep.percentage}%`}
            />
          ))}
        </div>

        {/* Legend grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2 select-none">
          {departments.map((dep) => (
            <div key={dep.name} className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${dep.color} shrink-0`} />
              <div>
                <span className="text-xs font-bold text-white block">{dep.name}</span>
                <span className="text-[10px] font-mono text-stone-500">
                  {dep.hours} hrs ({dep.percentage}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )}

      {/* ─── Feedback Toast Confirmation ─── */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}
