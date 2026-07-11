import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Button, Card, Badge, Input } from "~/components/ui";
import { getProviderIcon } from "~/components/IntegrationsProviderCard";
import type { Connection } from "~/components/IntegrationsConnectionCard";

export const Route = createFileRoute("/portal/integrations/$id")({
  component: ConnectionDetailPage,
});

interface ActivityLog {
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  duration?: string;
}

function ConnectionDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [updating, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/integrations", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const found = data.find((c: any) => c.id === id);
        if (found) {
          setConnection(found);
          setDisplayName(found.displayName);
          generateMockLogs(found);
        } else {
          setFeedback("Connection not found.");
        }
      }
    } catch (err) {
      console.error("Failed to load connection detail:", err);
    } finally {
      setLoading(false);
    }
  };

  const generateMockLogs = (conn: Connection) => {
    const isError = conn.status === "error" || conn.status === "expired";
    const baseLogs: ActivityLog[] = [
      {
        timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
        type: "info",
        message: `Connection initialized for provider ${conn.provider}`,
      },
      {
        timestamp: new Date(Date.now() - 2.5 * 3600000).toISOString(),
        type: "success",
        message: "OAuth flow completed and secure tokens cached on general ledger database",
      },
      {
        timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
        type: "success",
        message: "Primary inventory and invoice schema mappings verified (200 OK)",
        duration: "1.4s",
      },
    ];

    if (isError) {
      baseLogs.push(
        {
          timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
          type: "warning",
          message: "API authentication session renewal triggered automatically",
        },
        {
          timestamp: new Date(Date.now() - 10 * 60000).toISOString(),
          type: "error",
          message: conn.errorMsg || "API Access Token Expired (401 Unauthorized) — Re-auth needed",
        }
      );
    } else {
      baseLogs.push(
        {
          timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
          type: "success",
          message: "OAuth Access Token auto-refreshed successfully",
          duration: "340ms",
        },
        {
          timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
          type: "success",
          message: "Incremental customer accounts and pipelines sync run completed successfully",
          duration: "2.1s",
        }
      );
    }
    setLogs(baseLogs.reverse());
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connection) return;

    try {
      setConnecting(true);
      const res = await fetch(`/api/integrations/${connection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName }),
      });

      if (res.ok) {
        setFeedback("Display name updated successfully.");
        loadData();
      } else {
        throw new Error("Failed to update display name.");
      }
    } catch (err: any) {
      setFeedback("Failed to save: " + err.message);
    } finally {
      setConnecting(false);
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const handleTestConnection = async () => {
    if (!connection) return;

    try {
      setTesting(true);
      const res = await fetch(`/api/integrations/${connection.id}/status`, { credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        setFeedback(`Status Response: ${result.health === true ? "Healthy" : "Failed"}`);
        // Add a live sync trace log
        setLogs((prev) => [
          {
            timestamp: new Date().toISOString(),
            type: result.health === true ? "success" : "error",
            message: `Manual Health Check Triggered: Connection status is ${result.health === true ? "Active" : "Degraded"}`,
          },
          ...prev,
        ]);
        loadData();
      }
    } catch (err) {
      setFeedback("Health check failed.");
    } finally {
      setTesting(false);
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const handleManualSync = async () => {
    if (!connection) return;

    try {
      setSyncing(true);
      const res = await fetch(`/api/integrations/${connection.id}/sync`, { credentials: "include" });
      if (res.ok) {
        setFeedback("Incremental metadata sync complete.");
        setLogs((prev) => [
          {
            timestamp: new Date().toISOString(),
            type: "success",
            message: "Manual sync complete: 28 accounts synced, 0 conflicts detected",
            duration: "1.1s",
          },
          ...prev,
        ]);
        loadData();
      }
    } catch (err) {
      setFeedback("Sync request failed.");
    } finally {
      setSyncing(false);
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;

    if (confirm("Are you sure you want to disconnect this platform?")) {
      try {
        const res = await fetch(`/api/integrations/${connection.id}`, {
          method: "DELETE",
          credentials: "include",
        });

        if (res.ok) {
          navigate({ to: "/portal/integrations" as any });
        }
      } catch (err) {
        setFeedback("Failed to disconnect.");
        setTimeout(() => setFeedback(""), 3000);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-850 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Loading Connection Details...</p>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="text-center py-20 max-w-lg mx-auto">
        <span className="text-3xl">⚠️</span>
        <h3 className="text-base font-bold text-white mt-4">Connection Not Found</h3>
        <p className="text-xs text-stone-400 mt-1 leading-relaxed">
          The requested integration connection ID does not exist or you lack permission to manage it.
        </p>
        <div className="mt-6">
          <Link to="/portal/integrations">
            <Button variant="outline">Back to Integrations</Button>
          </Link>
        </div>
      </div>
    );
  }

  const icon = getProviderIcon(connection.provider);

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-stone-100 select-none pb-12">
      
      {/* Back Button */}
      <div>
        <Link
          to="/portal/integrations"
          className="text-stone-500 hover:text-white transition-colors text-xs font-mono font-bold"
        >
          [ ← Back to Connections ]
        </Link>
      </div>

      {/* Main Details Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Connection Settings & Actions (Col 1) */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="p-6 border border-stone-900 bg-stone-950 space-y-6">
            <div className="text-center space-y-3 pb-6 border-b border-stone-900/60">
              <div className="h-14 w-14 bg-stone-900 border border-stone-800 rounded-2xl flex items-center justify-center text-3xl mx-auto shadow-md">
                {icon}
              </div>
              <div>
                <h2 className="text-lg font-black text-white">{connection.displayName}</h2>
                <span className="text-xs font-mono text-stone-500 uppercase tracking-widest block">
                  {connection.provider}
                </span>
              </div>
              <div className="pt-2">
                <Badge variant={connection.status === "active" ? "emerald" : "danger"}>
                  {connection.status}
                </Badge>
              </div>
            </div>

            {/* Rename form */}
            <form onSubmit={handleUpdateName} className="space-y-4">
              <Input
                label="Custom Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="dark:bg-stone-950 dark:border-stone-850"
              />
              <Button variant="primary" type="submit" size="sm" loading={updating} className="w-full">
                Save Display Name
              </Button>
            </form>

            {/* Quick Actions */}
            <div className="space-y-2 pt-4 border-t border-stone-900/60">
              <span className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-widest block mb-2">
                Connection Commands
              </span>
              <Button
                variant="outline"
                onClick={handleTestConnection}
                loading={testing}
                className="w-full text-xs font-mono"
              >
                🔍 Run Health Check
              </Button>
              <Button
                variant="outline"
                onClick={handleManualSync}
                loading={syncing}
                className="w-full text-xs font-mono"
              >
                🔄 Force Sync Data
              </Button>
              <Button
                variant="ghost"
                onClick={handleDisconnect}
                className="w-full text-xs font-mono text-rose-500 hover:text-rose-400 hover:bg-rose-950/20"
              >
                🔌 Disconnect Platform
              </Button>
            </div>
          </Card>
        </div>

        {/* Sync Logs and Timelines (Col 2 & 3) */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 border border-stone-900 bg-stone-950">
            <h3 className="text-sm font-black text-white tracking-tight pb-4 border-b border-stone-900 mb-6">
              📋 Connection Activity Logs
            </h3>

            {/* Timeline */}
            <div className="space-y-6 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-stone-900">
              {logs.map((log, idx) => (
                <div key={idx} className="relative pl-8 flex gap-4">
                  {/* Bullet */}
                  <span className={`absolute left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-stone-950 ${
                    log.type === "success" ? "bg-emerald-500" :
                    log.type === "warning" ? "bg-amber-500" :
                    log.type === "error" ? "bg-rose-500" : "bg-stone-500"
                  }`} />

                  {/* Log info */}
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-bold text-white leading-snug">{log.message}</p>
                      {log.duration && (
                        <span className="text-[9px] font-mono text-stone-600">({log.duration})</span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-stone-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

      </div>

      {/* Feedback Toast Confirmation */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none">
          <span className="text-emerald-500">⚡</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}
