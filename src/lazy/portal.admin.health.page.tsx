import { useState, useEffect } from "react";
import { Card, Badge, Button } from "~/components/ui";



/**
 * Real shape served by /api/admin/health (owner-gated diagnostics endpoint):
 *   { status: "healthy", uptime: <seconds>, memory: process.memoryUsage(),
 *     timestamp: <ISO string> }
 * Every field below is optional so the page can never crash on a partial or
 * unexpected payload — unknown keys render "N/A" instead of throwing.
 */
interface HealthReport {
  status?: string;
  uptime?: number;
  timestamp?: string | number;
  memory?: {
    rss?: number;
    heapTotal?: number;
    heapUsed?: number;
    external?: number;
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
      // /api/admin/health is the owner-gated diagnostics endpoint and returns
      // { status, uptime, memory, timestamp } — the real shape. (The public
      // /api/health only carries status/uptime/timestamp with no memory
      // telemetry, so the admin page reads the richer owner-gated endpoint.)
      const res = await fetch("/api/admin/health");
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

  const isOperational =
    data?.status === "healthy" || data?.status === "ok" || data?.status === "UP";

  const formatUptime = (sec?: number) => {
    if (typeof sec !== "number" || Number.isNaN(sec)) return "N/A";
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = Math.floor(sec % 60);
    return `${hrs}h ${mins}m ${secs}s`;
  };

  const formatMB = (bytes?: number) =>
    typeof bytes === "number" ? (bytes / (1024 * 1024)).toFixed(1) : "N/A";

  const memory = data?.memory ?? {};
  const heapUsed = typeof memory.heapUsed === "number" ? memory.heapUsed : 0;
  const heapTotal = typeof memory.heapTotal === "number" ? memory.heapTotal : 0;
  const heapUsagePct = heapTotal > 0 ? Math.min(100, Math.round((heapUsed / heapTotal) * 100)) : 0;

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
        isOperational
          ? "bg-emerald-950/20 border-emerald-800/40"
          : "bg-amber-950/20 border-amber-800/40"
      }`}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-inner ${
            isOperational ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
          }`}>
            {isOperational ? "🟢" : "🟡"}
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider block">Global Platform State</span>
            <div className="flex items-center gap-2 mt-0.5">
              <h2 className="text-2xl font-black text-white">
                SYSTEM STATUS: {isOperational ? "OPERATIONAL" : "DEGRADED"}
              </h2>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-8">
          <div>
            <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">System Uptime</span>
            <span className="text-sm font-black text-white block mt-0.5">
              {formatUptime(data?.uptime)}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Telemetry Timestamp</span>
            <span className="text-sm font-black text-white block mt-0.5">
              {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Runtime telemetry (real values from the owner-gated health endpoint) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Process memory card */}
        <Card className="bg-stone-900/50 border-stone-800/80 p-6 rounded-3xl space-y-6">
          <h4 className="text-md font-black text-white border-b border-stone-800/80 pb-3 flex items-center gap-2">
            🖥️ Process Memory Telemetry
          </h4>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800/60">
                <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">RSS</span>
                <span className="text-lg font-mono font-black text-white block mt-1">{formatMB(memory.rss)} MB</span>
              </div>
              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800/60">
                <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Heap Used</span>
                <span className="text-lg font-mono font-black text-white block mt-1">{formatMB(memory.heapUsed)} MB</span>
              </div>
              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800/60">
                <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Heap Total</span>
                <span className="text-lg font-mono font-black text-white block mt-1">{formatMB(memory.heapTotal)} MB</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-stone-400 font-bold">Heap Utilization</span>
                <span className="text-emerald-400 font-black">{heapTotal > 0 ? `${heapUsagePct}%` : "N/A"}</span>
              </div>
              <div className="w-full bg-stone-950 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    heapUsagePct < 70 ? "bg-emerald-500" : heapUsagePct < 90 ? "bg-amber-500" : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.max(heapTotal > 0 ? 2 : 0, heapUsagePct)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </Card>

        {/* Runtime card */}
        <Card className="bg-stone-900/50 border-stone-800/80 p-6 rounded-3xl space-y-6">
          <h4 className="text-md font-black text-white border-b border-stone-800/80 pb-3 flex items-center gap-2">
            ⏱️ Server Runtime
          </h4>
          <div className="space-y-4">
            <div className="flex justify-between items-center text-xs">
              <span className="text-stone-400 font-bold">Health Status</span>
              <Badge className={isOperational ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}>
                {isOperational ? "HEALTHY" : "DEGRADED"}
              </Badge>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-stone-400 font-bold">Process Uptime</span>
              <span className="text-white font-mono font-black">{formatUptime(data?.uptime)}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-stone-400 font-bold">Telemetry Reported At</span>
              <span className="text-stone-300 font-black">
                {data?.timestamp ? new Date(data.timestamp).toLocaleString() : "N/A"}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default AdminHealthPage;
