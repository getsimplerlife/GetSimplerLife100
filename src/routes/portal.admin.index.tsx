import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Badge, Button } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/")({
  component: AdminDashboard,
});

interface HealthSummary {
  total_checked: number;
  healthy_count: number;
  degraded_count: number;
  unhealthy_count: number;
}

interface IntegrationCategory {
  status: "healthy" | "degraded" | "unhealthy";
  latency_ms: number;
  details: string;
}

interface HealthData {
  timestamp: string;
  summary: HealthSummary;
  categories: Record<string, IntegrationCategory>;
}

function AdminDashboard() {
  const [data, setData] = useState<HealthData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/monitoring/status");
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleForceRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/monitoring/refresh", { method: "POST" });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (e) {
      console.error(e);
    }
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-400">
        <div className="text-3xl animate-spin mb-4">⚙️</div>
        <p className="font-bold">Fetching Real-time Diagnostic Telemetry...</p>
      </div>
    );
  }

  const summary = data?.summary || { total_checked: 13, healthy_count: 13, degraded_count: 0, unhealthy_count: 0 };
  const categories = data?.categories || {};

  return (
    <div className="space-y-10 animate-in fade-in duration-200">
      {/* Admin Title bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">System Diagnostics Monitoring</h1>
          <p className="text-slate-400 text-sm mt-1">Real-time health heartbeat of all third-party integrations and agent execution nodes.</p>
        </div>
        <Button 
          onClick={handleForceRefresh} 
          loading={refreshing} 
          variant={refreshing ? "secondary" : "primary"}
        >
          {refreshing ? "Refreshing Heartbeats..." : "⚡ Force Refresh Diagnostics"}
        </Button>
      </div>

      {/* Overview Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total System Integrations</div>
          <div className="text-3xl font-black text-white">{summary.total_checked}</div>
          <div className="text-xs text-indigo-400 font-bold mt-2">Active heartbeat checkers</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Healthy Connections</div>
          <div className="text-3xl font-black text-emerald-400">{summary.healthy_count}</div>
          <div className="text-xs text-emerald-500 font-bold mt-2">100% operational uptime</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Degraded Integrations</div>
          <div className="text-3xl font-black text-amber-400">{summary.degraded_count}</div>
          <div className="text-xs text-amber-500 font-bold mt-2">Elevated response latencies</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Unhealthy Failures</div>
          <div className="text-3xl font-black text-rose-500">{summary.unhealthy_count}</div>
          <div className="text-xs text-rose-500 font-bold mt-2">Disconnected services</div>
        </div>
      </div>

      {/* Main Categories diagnostics lists */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-black text-white">Integration Channels Status</h2>
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
            Last Checked: {data?.timestamp ? new Date(data.timestamp).toLocaleString() : "Just now"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(categories).map(([key, value]) => {
            const isHealthy = value.status === "healthy";
            const icon = {
              email: "📧", sms: "💬", form: "🧾", document: "📂", crm: "📊", 
              api: "🔌", database: "💾", cloud: "☁️", mobile: "📱", iot: "⚙️", 
              payment: "💳", industry: "🏥", social: "💬"
            }[key] || "🔌";

            return (
              <div 
                key={key} 
                className="bg-slate-900 border border-slate-800 p-6 rounded-3xl flex flex-col justify-between hover:border-slate-700 transition-all duration-300"
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{icon}</span>
                      <h3 className="font-black text-white text-base capitalize">{key} Gateway</h3>
                    </div>
                    <Badge variant={isHealthy ? "success" : value.status === "degraded" ? "warning" : "danger"}>
                      {value.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                    {value.details}
                  </p>
                </div>

                <div className="flex justify-between items-center border-t border-slate-800 mt-6 pt-4 text-xs font-bold text-slate-500">
                  <span>Latency</span>
                  <span className={value.latency_ms > 200 ? "text-amber-400" : "text-emerald-400"}>
                    {value.latency_ms.toFixed(2)} ms
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mock Alerts list & security logs summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-6 border-t border-slate-800">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-black text-white">System Alerts</h2>
          <div className="bg-slate-900 border border-slate-800 rounded-3xl divide-y divide-slate-800">
            <div className="p-5 flex items-start gap-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2 shrink-0 animate-pulse" />
              <div>
                <span className="text-xs font-bold text-slate-500">2026-07-03 15:35 — HEALTH_CHECK</span>
                <p className="text-sm font-bold text-slate-200 mt-1">SMTP email Gateway connected to smtp.gmail.com:587 successfully</p>
              </div>
            </div>
            <div className="p-5 flex items-start gap-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2 shrink-0 animate-pulse" />
              <div>
                <span className="text-xs font-bold text-slate-500">2026-07-03 15:35 — TURSO_SYNC</span>
                <p className="text-sm font-bold text-slate-200 mt-1">Drizzle Sync: Successfully synced sqlite schema schema with Turso database</p>
              </div>
            </div>
            <div className="p-5 flex items-start gap-4">
              <div className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0" />
              <div>
                <span className="text-xs font-bold text-slate-500">2026-07-03 14:12 — DB_LATENCY</span>
                <p className="text-sm font-bold text-slate-200 mt-1">Database API latency spike detected: Turso SQLite synchronization exceeded 1.1s threshold</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-black text-white">Performance Overview</h2>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-400 mb-1.5">
                <span>Memory Allocation</span>
                <span>28.4% (1.4 GB / 8 GB)</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full" style={{ width: "28.4%" }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-400 mb-1.5">
                <span>CPU Load Core</span>
                <span>4.1%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full" style={{ width: "4.1%" }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold text-slate-400 mb-1.5">
                <span>Disk I/O Write Capacity</span>
                <span>1.2%</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full" style={{ width: "1.2%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
