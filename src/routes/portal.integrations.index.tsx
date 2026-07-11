import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { IntegrationsConnectionCard, type Connection } from "~/components/IntegrationsConnectionCard";
import { IntegrationsConnectModal } from "~/components/IntegrationsConnectModal";
import { Button, Card } from "~/components/ui";

export const Route = createFileRoute("/portal/integrations/")({
  component: ConnectedServicesPage,
});

interface HealthStats {
  total: number;
  active: number;
  error: number;
  expired: number;
  pending: number;
}

function ConnectedServicesPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [stats, setStats] = useState<HealthStats>({ total: 0, active: 0, error: 0, expired: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [testingAll, setTestingAll] = useState(false);
  const [testingMap, setTestingMap] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load connections
      const res = await fetch("/api/integrations", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConnections(data);
      }

      // Load stats
      const statsRes = await fetch("/api/integrations/health", { credentials: "include" });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      console.error("Failed to load integrations data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDisconnect = async (id: string) => {
    try {
      setFeedback("Disconnecting connection...");
      const res = await fetch(`/api/integrations/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        setFeedback("Connection successfully removed.");
        loadData();
      } else {
        throw new Error("Failed to delete connection.");
      }
    } catch (err: any) {
      setFeedback("Failed to disconnect: " + err.message);
    } finally {
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const handleTestStatus = async (id: string) => {
    try {
      setTestingMap((prev) => ({ ...prev, [id]: true }));
      const res = await fetch(`/api/integrations/${id}/status`, { credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        setFeedback(`Health check: ${result.health === true ? "Healthy (200 OK)" : "Degraded"}`);
        loadData();
      }
    } catch (err) {
      setFeedback("Health check failed.");
    } finally {
      setTestingMap((prev) => ({ ...prev, [id]: false }));
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const handleTestAll = async () => {
    try {
      setTestingAll(true);
      setFeedback("Testing all integrations...");
      
      // Concurrently test all
      await Promise.all(
        connections.map(async (c) => {
          try {
            await fetch(`/api/integrations/${c.id}/status`, { credentials: "include" });
          } catch {
            // ignore per-connection error
          }
        })
      );

      setFeedback("All integration connections tested.");
      loadData();
    } catch (err) {
      setFeedback("Batch health check encountered problems.");
    } finally {
      setTestingAll(false);
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  if (loading && connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-850 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Fetching Connected Services...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-stone-100 select-none pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-stone-900 pb-5 gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">🔌 Connected Integrations</h1>
          <p className="text-stone-400 text-xs mt-1">
            Establish connection with your CRM, ERP, HR systems and automate real-time background syncs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestAll}
            loading={testingAll}
            className="text-xs font-mono font-bold"
          >
            📊 Test All Connections
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="text-xs font-mono font-black"
          >
            ✨ Connect Service
          </Button>
        </div>
      </div>

      {/* Connection Health Dashboard Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4 border border-stone-900 bg-stone-950 flex flex-col justify-between">
          <span className="text-[9px] font-mono text-stone-500 uppercase tracking-widest">Total Connections</span>
          <span className="text-3xl font-black text-white mt-2">{stats.total}</span>
        </Card>
        <Card className="p-4 border border-stone-900 bg-emerald-950/20 flex flex-col justify-between">
          <span className="text-[9px] font-mono text-emerald-500 uppercase tracking-widest">Active / Healthy</span>
          <span className="text-3xl font-black text-emerald-400 mt-2">{stats.active}</span>
        </Card>
        <Card className="p-4 border border-stone-900 bg-rose-950/20 flex flex-col justify-between">
          <span className="text-[9px] font-mono text-rose-500 uppercase tracking-widest">Critical Errors</span>
          <span className="text-3xl font-black text-rose-400 mt-2">{stats.error}</span>
        </Card>
        <Card className="p-4 border border-stone-900 bg-amber-950/20 flex flex-col justify-between">
          <span className="text-[9px] font-mono text-amber-500 uppercase tracking-widest">Expired Session</span>
          <span className="text-3xl font-black text-amber-400 mt-2">{stats.expired}</span>
        </Card>
        <Card className="p-4 border border-stone-900 bg-stone-950 flex flex-col justify-between">
          <span className="text-[9px] font-mono text-stone-500 uppercase tracking-widest">Awaiting Verification</span>
          <span className="text-3xl font-black text-stone-400 mt-2">{stats.pending}</span>
        </Card>
      </div>

      {/* Main Connection list */}
      {connections.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connections.map((conn) => (
            <IntegrationsConnectionCard
              key={conn.id}
              connection={conn}
              onDisconnect={handleDisconnect}
              onTest={handleTestStatus}
              isTesting={testingMap[conn.id] || false}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 border border-stone-900 rounded-3xl bg-stone-950/10">
          <span className="text-3xl block">🔌</span>
          <h3 className="text-base font-bold text-white mt-4">No Third-Party Connections Established</h3>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto leading-relaxed">
            Automate invoicing, procurement, and logs by connecting your company's active workspace systems right now.
          </p>
          <div className="mt-6">
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              Launch Connection Wizard
            </Button>
          </div>
        </div>
      )}

      {/* Connect Modal */}
      <IntegrationsConnectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConnectionSuccess={loadData}
      />

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
