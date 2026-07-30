import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

export const Route = createFileRoute("/portal/connected-accounts/")({
  component: ConnectedAccountsPage,
});

interface ProviderInfo {
  id: string;
  name: string;
  category: string;
  icon: string;
}

interface EnrichedConnection {
  id: string;
  provider: string;
  providerId: string;
  category: string;
  status: string;
  connectedAt?: string;
  lastSync?: string;
  _provider: ProviderInfo;
}

interface SlotInfo {
  totalSlots: number;
  usedSlots: number;
  remainingSlots: number;
  isOwner: boolean;
}

interface ConnectedAccountsData {
  crm: EnrichedConnection[];
  erp: EnrichedConnection[];
  other: EnrichedConnection[];
  crmSlots: SlotInfo;
  erpSlots: SlotInfo;
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case "Connected": return "🟢";
    case "error": return "🔴";
    case "expired": return "🟠";
    case "pending": return "🟡";
    default: return "⚪";
  }
}

function ConnectedAccountsPage() {
  const [data, setData] = useState<ConnectedAccountsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/data/connected-accounts", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load connected accounts");
      }
      setData(await res.json());
    } catch (err: any) {
      console.error("Error fetching connected accounts:", err);
      setError(err.message || "Failed to load connected accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDisconnect = async (connectionId: string, providerName: string, type: "crm" | "erp" | "other") => {
    const slotMsg = type === "crm" ? "This will free up 1 CRM slot."
      : type === "erp" ? "This will free up 1 ERP slot." : "";
    if (!confirm(`Disconnect ${providerName}?\n\n${slotMsg}`)) return;

    setDisconnecting(connectionId);
    try {
      const res = await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Disconnect failed");
      }
    } catch (err) {
      console.error("Disconnect error:", err);
      alert("Disconnect failed.");
    } finally {
      setDisconnecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-stone-400 font-bold">{error}</p>
        <button onClick={fetchData} className="text-emerald-400 font-bold text-sm hover:text-emerald-300">
          Try Again
        </button>
      </div>
    );
  }

  const crmConns = data?.crm || [];
  const erpConns = data?.erp || [];
  const otherConns = data?.other || [];
  const crmSlots = data?.crmSlots || { totalSlots: 0, usedSlots: 0, remainingSlots: 0, isOwner: false };
  const erpSlots = data?.erpSlots || { totalSlots: 0, usedSlots: 0, remainingSlots: 0, isOwner: false };
  const totalConnections = crmConns.length + erpConns.length + otherConns.length;

  const crmCanConnect = crmSlots.isOwner || crmSlots.remainingSlots > 0;
  const erpCanConnect = erpSlots.isOwner || erpSlots.remainingSlots > 0;

  const renderConnectionCard = (conn: EnrichedConnection, type: "crm" | "erp" | "other") => (
    <div
      key={conn.id}
      className={`bg-stone-900 border rounded-2xl p-5 flex items-center justify-between gap-4 transition-all group ${
        conn.status === "Connected" ? "border-emerald-800/50" :
        conn.status === "error" ? "border-rose-800/50" : "border-stone-800 hover:border-stone-700"
      }`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="h-10 w-10 bg-stone-800 border border-stone-700 rounded-xl flex items-center justify-center text-xl shrink-0">
          {conn._provider?.icon || "🔌"}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm truncate">{conn._provider?.name || conn.provider}</span>
            <span className={`text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
              conn.status === "Connected"
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/40"
                : conn.status === "error"
                ? "bg-rose-950/40 text-rose-400 border-rose-900/40"
                : "bg-stone-800 text-stone-400 border-stone-700"
            }`}>
              {conn.status}
            </span>
          </div>
          <div className="text-[10px] text-stone-500 mt-0.5">
            {conn._provider?.category || conn.category || "Other"} · Connected {conn.connectedAt ? new Date(conn.connectedAt).toLocaleDateString() : "—"}
          </div>
        </div>
      </div>
      <button
        onClick={() => handleDisconnect(conn.id, conn._provider?.name || conn.provider, type)}
        disabled={disconnecting === conn.id}
        className="shrink-0 px-4 py-2 rounded-xl font-bold text-xs transition-all bg-stone-800 text-stone-400 hover:bg-rose-600/20 hover:text-rose-400 border border-stone-700 hover:border-rose-800/50 disabled:opacity-50"
      >
        {disconnecting === conn.id ? "..." : "Disconnect"}
      </button>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">🔗 Connected Accounts</h1>
        <p className="text-stone-400 mt-1">
          Manage all your connected CRM, ERP, and integration accounts in one place. {totalConnections} total connection{totalConnections !== 1 ? "s" : ""}.
        </p>
      </div>

      {/* Slot Cards Row */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* CRM Slot Card */}
        <div className={`rounded-2xl p-5 border ${crmCanConnect ? "bg-emerald-950/20 border-emerald-900/40" : "bg-amber-950/20 border-amber-900/40"}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">👥 CRM Slots</div>
              <div className={`text-2xl font-black ${crmCanConnect ? "text-emerald-400" : "text-amber-400"}`}>
                {crmConns.length} <span className="text-base font-normal text-stone-400">/ {crmSlots.isOwner ? "∞" : crmSlots.totalSlots} used</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {!crmSlots.isOwner && crmSlots.remainingSlots === 0 ? (
                <span className="text-2xl">🔒</span>
              ) : (
                <span className={`text-xs font-bold ${crmSlots.remainingSlots > 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {crmSlots.remainingSlots} slot{crmSlots.remainingSlots !== 1 ? "s" : ""} free
                </span>
              )}
              {!crmCanConnect && (
                <Link to="/portal/marketplace" className="text-[10px] text-amber-400 hover:text-amber-300 font-bold">
                  Get more slots →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ERP Slot Card */}
        <div className={`rounded-2xl p-5 border ${erpCanConnect ? "bg-emerald-950/20 border-emerald-900/40" : "bg-amber-950/20 border-amber-900/40"}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">🏢 ERP Slots</div>
              <div className={`text-2xl font-black ${erpCanConnect ? "text-emerald-400" : "text-amber-400"}`}>
                {erpConns.length} <span className="text-base font-normal text-stone-400">/ {erpSlots.isOwner ? "∞" : erpSlots.totalSlots} used</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {!erpSlots.isOwner && erpSlots.remainingSlots === 0 ? (
                <span className="text-2xl">🔒</span>
              ) : (
                <span className={`text-xs font-bold ${erpSlots.remainingSlots > 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {erpSlots.remainingSlots} slot{erpSlots.remainingSlots !== 1 ? "s" : ""} free
                </span>
              )}
              {!erpCanConnect && (
                <Link to="/portal/marketplace" className="text-[10px] text-amber-400 hover:text-amber-300 font-bold">
                  Get more slots →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CRM Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black text-white">👥 CRM Accounts</h2>
            <span className="text-xs text-stone-500 font-mono">{crmConns.length} connected</span>
            {!crmCanConnect && <span className="text-xs text-amber-400 font-bold">🔒 All slots used</span>}
          </div>
          {crmCanConnect && (
            <Link to="/portal/crm" className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold">
              + Connect CRM →
            </Link>
          )}
        </div>
        {crmConns.length === 0 ? (
          <div className="bg-stone-900 border border-dashed border-stone-800 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-2">👥</div>
            <p className="text-stone-400 font-bold text-sm">No CRM accounts connected</p>
            <p className="text-stone-500 text-xs mt-1">Connect Salesforce, HubSpot, or other CRM systems.</p>
            {crmCanConnect && (
              <Link to="/portal/crm" className="inline-block mt-3 text-emerald-400 font-bold text-sm hover:text-emerald-300">
                Browse CRM providers →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {crmConns.map(c => renderConnectionCard(c, "crm"))}
          </div>
        )}
      </section>

      {/* ERP Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black text-white">🏢 ERP & Accounting</h2>
            <span className="text-xs text-stone-500 font-mono">{erpConns.length} connected</span>
            {!erpCanConnect && <span className="text-xs text-amber-400 font-bold">🔒 All slots used</span>}
          </div>
          {erpCanConnect && (
            <Link to="/portal/erp" className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold">
              + Connect ERP →
            </Link>
          )}
        </div>
        {erpConns.length === 0 ? (
          <div className="bg-stone-900 border border-dashed border-stone-800 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-2">🏢</div>
            <p className="text-stone-400 font-bold text-sm">No ERP accounts connected</p>
            <p className="text-stone-500 text-xs mt-1">Connect Sage, NetSuite, QuickBooks, or other ERP/accounting systems.</p>
            {erpCanConnect && (
              <Link to="/portal/erp" className="inline-block mt-3 text-emerald-400 font-bold text-sm hover:text-emerald-300">
                Browse ERP providers →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {erpConns.map(c => renderConnectionCard(c, "erp"))}
          </div>
        )}
      </section>

      {/* App Integrations Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-black text-white">🔌 App Integrations</h2>
            <span className="text-xs text-stone-500 font-mono">{otherConns.length} connected</span>
          </div>
          <Link to="/portal/integrations" className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold">
            + Connect Apps →
          </Link>
        </div>
        {otherConns.length === 0 ? (
          <div className="bg-stone-900 border border-dashed border-stone-800 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-2">🔌</div>
            <p className="text-stone-400 font-bold text-sm">No app integrations connected</p>
            <p className="text-stone-500 text-xs mt-1">Connect Slack, Gmail, Zoom, and 180+ other platforms.</p>
            <Link to="/portal/integrations" className="inline-block mt-3 text-emerald-400 font-bold text-sm hover:text-emerald-300">
              Browse integrations →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {otherConns.map(c => renderConnectionCard(c, "other"))}
          </div>
        )}
      </section>
    </div>
  );
}
