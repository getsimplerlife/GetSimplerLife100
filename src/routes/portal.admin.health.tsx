import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, Badge, Button } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/health")({
  component: AdminHealthPage,
});

interface HealthReport {
  status: string;
  timestamp: string;
  uptime_seconds: number;
  components: {
    database: { status: string; latency_ms: number };
    python: { status: string; latency_ms: number };
    storage: { status: string; latency_ms: number };
  };
  system_metrics: {
    memory_free_mb: number;
    memory_total_mb: number;
    memory_usage_pct: number;
    load_average: number[];
  };
}

function AdminHealthPage() {
  const [data, setData] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch health report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchHealth();
    setRefreshing(false);
  };

  const triggerBackup = async () => {
    setBackupLoading(true);
    setBackupMessage(null);
    try {
      // Create local backup script execution endpoint
      const res = await fetch("/api/admin/backup", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.success) {
        setBackupMessage(`✅ Backup created successfully at: ${json.path} (${json.size_kb} KB)`);
      } else {
        setBackupMessage(`❌ Backup failed: ${json.error || "Unknown error"}`);
      }
    } catch (err: any) {
      setBackupMessage(`❌ Backup trigger error: ${err.message}`);
    } finally {
      setBackupLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-stone-400 font-bold">Querying infrastructure heartbeats...</p>
        </div>
      </div>
    );
  }

  const formatUptime = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    return `${hrs}h ${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            🎛️ Infrastructure Monitoring
          </h1>
          <p className="text-stone-400 font-medium text-sm mt-1">
            Real-time status indicators, system resource telemetry, and connectivity checks.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={triggerBackup}
            disabled={backupLoading}
            variant="secondary"
            className="bg-stone-900 border border-stone-800 hover:bg-stone-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center gap-2"
          >
            💾 {backupLoading ? "Backing up..." : "Create DB Backup"}
          </Button>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-900/30 flex items-center gap-2"
          >
            🔄 {refreshing ? "Refreshing..." : "Refresh Live Status"}
          </Button>
        </div>
      </div>

      {backupMessage && (
        <div className="bg-stone-900 border border-stone-800 p-4 rounded-2xl text-xs font-black text-stone-300">
          {backupMessage}
        </div>
      )}

      {/* Hero overall status banner */}
      <div className={`p-6 rounded-3xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 ${
        data?.status === "UP" 
          ? "bg-emerald-950/20 border-emerald-800/40" 
          : "bg-amber-950/20 border-amber-800/40"
      }`}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner ${
            data?.status === "UP" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
          }`}>
            {data?.status === "UP" ? "🟢" : "🟡"}
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider block">Global Platform State</span>
            <div className="flex items-center gap-2 mt-0.5">
              <h2 className="text-2xl font-black text-white">
                SYSTEM STATUS: {data?.status === "UP" ? "OPERATIONAL" : "DEGRADED"}
              </h2>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-8">
          <div>
            <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">System Uptime</span>
            <span className="text-sm font-black text-white block mt-0.5">
              {data ? formatUptime(data.uptime_seconds) : "N/A"}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Telemetry Timestamp</span>
            <span className="text-sm font-black text-white block mt-0.5">
              {data ? new Date(data.timestamp).toLocaleTimeString() : "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of Component Checks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* DB HEALTH */}
        <Card className="bg-stone-900/50 border-stone-800/80 p-6 rounded-3xl">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Database Store</span>
              <h3 className="text-lg font-black text-white">SQLite via Turso</h3>
            </div>
            <Badge className={data?.components.database.status === "healthy" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}>
              {data?.components.database.status === "healthy" ? "HEALTHY" : "UNHEALTHY"}
            </Badge>
          </div>
          <div className="mt-8 space-y-4">
            <div className="flex justify-between items-center text-xs">
              <span className="text-stone-400 font-bold">Query Latency</span>
              <span className="text-white font-mono font-black">{data?.components.database.latency_ms} ms</span>
            </div>
            <div className="w-full bg-stone-950 h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  (data?.components.database.latency_ms || 0) < 50 ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(10, 100 - (data?.components.database.latency_ms || 0) / 2))}%` }}
              ></div>
            </div>
          </div>
        </Card>

        {/* PYTHON HEALTH */}
        <Card className="bg-stone-900/50 border-stone-800/80 p-6 rounded-3xl">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">AI Runtime Engine</span>
              <h3 className="text-lg font-black text-white">Python Executor</h3>
            </div>
            <Badge className={data?.components.python.status === "healthy" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}>
              {data?.components.python.status === "healthy" ? "HEALTHY" : "UNHEALTHY"}
            </Badge>
          </div>
          <div className="mt-8 space-y-4">
            <div className="flex justify-between items-center text-xs">
              <span className="text-stone-400 font-bold">Process Spawn Execution</span>
              <span className="text-white font-mono font-black">{data?.components.python.latency_ms} ms</span>
            </div>
            <div className="w-full bg-stone-950 h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  (data?.components.python.latency_ms || 0) < 200 ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(10, 100 - (data?.components.python.latency_ms || 0) / 5))}%` }}
              ></div>
            </div>
          </div>
        </Card>

        {/* STORAGE HEALTH */}
        <Card className="bg-stone-900/50 border-stone-800/80 p-6 rounded-3xl">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">File Storage Access</span>
              <h3 className="text-lg font-black text-white">uploads/ directory</h3>
            </div>
            <Badge className={data?.components.storage.status === "healthy" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}>
              {data?.components.storage.status === "healthy" ? "HEALTHY" : "UNHEALTHY"}
            </Badge>
          </div>
          <div className="mt-8 space-y-4">
            <div className="flex justify-between items-center text-xs">
              <span className="text-stone-400 font-bold">Read-Write IO Roundtrip</span>
              <span className="text-white font-mono font-black">{data?.components.storage.latency_ms} ms</span>
            </div>
            <div className="w-full bg-stone-950 h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  (data?.components.storage.latency_ms || 0) < 10 ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(10, 100 - (data?.components.storage.latency_ms || 0) * 5))}%` }}
              ></div>
            </div>
          </div>
        </Card>
      </div>

      {/* Metrics & System status details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System telemetry card */}
        <Card className="bg-stone-900/50 border-stone-800/80 p-6 rounded-3xl space-y-6">
          <h4 className="text-md font-black text-white border-b border-stone-800/80 pb-3 flex items-center gap-2">
            🖥️ Host Memory Telemetry
          </h4>
          <div className="space-y-4">
            <div className="flex justify-between items-center text-xs">
              <span className="text-stone-400 font-bold">Memory Free / Total</span>
              <span className="text-stone-300 font-black">
                {data?.system_metrics.memory_free_mb} MB / {data?.system_metrics.memory_total_mb} MB
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-400 font-bold">Memory Utilization Percentage</span>
                <span className="text-emerald-400 font-black">{data?.system_metrics.memory_usage_pct}%</span>
              </div>
              <div className="w-full bg-stone-950 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${data?.system_metrics.memory_usage_pct}%` }}
                ></div>
              </div>
            </div>
          </div>
        </Card>

        {/* Load average telemetry card */}
        <Card className="bg-stone-900/50 border-stone-800/80 p-6 rounded-3xl space-y-6">
          <h4 className="text-md font-black text-white border-b border-stone-800/80 pb-3 flex items-center gap-2">
            📈 Host CPU Telemetry (Load Averages)
          </h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800/60">
              <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">1-Min Average</span>
              <span className="text-xl font-mono font-black text-white block mt-1">
                {data?.system_metrics.load_average[0]?.toFixed(2) || "0.00"}
              </span>
            </div>
            <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800/60">
              <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">5-Min Average</span>
              <span className="text-xl font-mono font-black text-white block mt-1">
                {data?.system_metrics.load_average[1]?.toFixed(2) || "0.00"}
              </span>
            </div>
            <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800/60">
              <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">15-Min Average</span>
              <span className="text-xl font-mono font-black text-white block mt-1">
                {data?.system_metrics.load_average[2]?.toFixed(2) || "0.00"}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Cloudflare Observability notification banner */}
      <div className="p-6 rounded-3xl bg-emerald-950/20 border border-emerald-800/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h4 className="text-sm font-black text-white flex items-center gap-2">
            🌐 Cloudflare Observability & Logging Active
          </h4>
          <p className="text-xs text-stone-400 font-medium max-w-2xl">
            Edge requests, routing telemetry, and API usage stats are routed dynamically via Cloudflare Observability metrics pipelines to ensure sub-millisecond response guarantees.
          </p>
        </div>
        <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          EDGE OBSERVABILITY ACTIVE
        </Badge>
      </div>
    </div>
  );
}