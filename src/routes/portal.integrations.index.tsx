import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/integrations/")({
  component: ConnectedServices,
});

interface IntegrationItem {
  id: string;
  name: string;
  description: string;
  logo: string;
  status: "Connected" | "Needs Attention" | "Disconnected";
  health: string;
  lastSync: string;
}

function ConnectedServices() {
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/data/integrations", { credentials: "include" });
        const d = await res.json();
        
        if (d.data && d.data.length > 0) {
          setIntegrations(d.data);
        } else {
          // Seed standard premium integration log matrices
          const defaultServices: IntegrationItem[] = [
            {
              id: "int-1",
              name: "Salesforce CRM Enterprise",
              description: "Syncs customer contracts, pipeline status, and schedules background account audits automatically.",
              logo: "☁️",
              status: "Connected",
              health: "100% Operational",
              lastSync: "3 mins ago"
            },
            {
              id: "int-2",
              name: "HubSpot Marketing & Sales",
              description: "Dispatches pre-qualified leads directly into active pipelines and maps deal metadata exceptions.",
              logo: "🧡",
              status: "Connected",
              health: "100% Operational",
              lastSync: "10 mins ago"
            },
            {
              id: "int-3",
              name: "QuickBooks Online Ledger",
              description: "Pushes verified billing line-items and tax receipts directly to your enterprise accounting general ledger.",
              logo: "🟢",
              status: "Needs Attention",
              health: "Mismatched PO Metadata (Rate limited)",
              lastSync: "1 hour ago"
            },
            {
              id: "int-4",
              name: "Slack Workflow Notifications",
              description: "Sends status trace logs, critical cognitive fails, and human supervisor exception approvals directly to Slack.",
              logo: "💬",
              status: "Connected",
              health: "100% Operational",
              lastSync: "Instant (Real-time)"
            },
            {
              id: "int-5",
              name: "Google Workspace & Drive",
              description: "Monitors shared directories, downloads scanned PDF tables, and pre-qualifies incoming attachments.",
              logo: "📂",
              status: "Connected",
              health: "100% Operational",
              lastSync: "5 mins ago"
            },
            {
              id: "int-6",
              name: "Stripe Billing Infrastructure",
              description: "Retrieves metadata payloads, process refunds, and auto-verifies receipt matching pipelines.",
              logo: "💳",
              status: "Connected",
              health: "100% Operational",
              lastSync: "Instant (Real-time)"
            },
            {
              id: "int-7",
              name: "Outlook & Microsoft Exchange",
              description: "Reads incoming inquiry attachments, extracts metadata indexes, and schedules Outlook calendar runs.",
              logo: "📧",
              status: "Disconnected",
              health: "API Access Token Expired",
              lastSync: "2 days ago"
            },
            {
              id: "int-8",
              name: "Shopify Merchant Store API",
              description: "Imports inventory logs, auto-verifies purchase orders, and reconciles credit card receipts with Stripe.",
              logo: "🛒",
              status: "Disconnected",
              health: "Awaiting OAuth Authentication",
              lastSync: "Never"
            }
          ];

          await fetch("/api/data/integrations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ data: defaultServices }),
          });

          setIntegrations(defaultServices);
        }
        setLoading(false);
      } catch (err) {
        console.error("Integrations fetch error:", err);
        setLoading(false);
      }
    })();
  }, []);

  const handleAction = async (itemId: string, currentStatus: "Connected" | "Needs Attention" | "Disconnected") => {
    const isConnected = currentStatus === "Connected";
    const nextStatus = isConnected ? "Disconnected" : "Connected";
    const actionText = isConnected ? "disconnect" : "connect";

    try {
      setFeedback(`Processing integration: ${actionText}...`);
      
      const updated = integrations.map((itm) => {
        if (itm.id === itemId) {
          return {
            ...itm,
            status: nextStatus as any,
            health: nextStatus === "Connected" ? "100% Operational" : "Awaiting Configuration",
            lastSync: nextStatus === "Connected" ? "Just now" : "Never"
          };
        }
        return itm;
      });

      setIntegrations(updated);

      // Save changes back to database
      await fetch("/api/data/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: updated }),
      });

      // Audit Log Action
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "integration_" + actionText,
          resource: itemId,
          details: { id: itemId, state: nextStatus },
        }),
      });

      setFeedback(`Success: Integration has been ${actionText}ed!`);
      setTimeout(() => setFeedback(""), 2500);
    } catch (err) {
      console.error(err);
      setFeedback(`Failed to connect/disconnect integration.`);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-850 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Fetching Connected Services...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-stone-100 select-none">
      
      {/* ─── Header ─── */}
      <div className="border-b border-stone-900 pb-5">
        <h1 className="text-3xl font-black text-white tracking-tight">🔌 Connected Integrations</h1>
        <p className="text-stone-400 text-xs mt-1">
          Manage connected third-party platforms, monitor API authentication keys, and configure active sync parameters.
        </p>
      </div>

      {/* ─── Integrations Grid layout ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {integrations.map((itm) => (
          <div
            key={itm.id}
            className="bg-stone-950 border border-stone-900 hover:border-stone-850 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-lg"
          >
            <div className="space-y-4">
              {/* Logo icon & Name Row */}
              <div className="flex justify-between items-start">
                <div className="h-11 w-11 bg-stone-900 border border-stone-800 rounded-xl flex items-center justify-center text-xl shadow-md">
                  {itm.logo}
                </div>

                <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md border ${
                  itm.status === "Connected" ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/60" :
                  itm.status === "Needs Attention" ? "bg-amber-950/40 text-amber-400 border-amber-900/60 animate-pulse" :
                  "bg-stone-900/60 text-stone-500 border-stone-900"
                }`}>
                  {itm.status}
                </span>
              </div>

              {/* Info text */}
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-white leading-snug">{itm.name}</h3>
                <p className="text-stone-400 text-[10px] leading-relaxed font-semibold min-h-[40px] line-clamp-2">
                  {itm.description}
                </p>
              </div>

              {/* Status details segment table */}
              <div className="bg-stone-900/10 border border-stone-900/60 rounded-lg p-2.5 space-y-1.5 text-[9px] font-mono text-stone-500">
                <div className="flex justify-between">
                  <span>HEALTH CHECK</span>
                  <span className={`font-bold ${
                    itm.status === "Connected" ? "text-emerald-500" :
                    itm.status === "Needs Attention" ? "text-amber-500" : "text-rose-500"
                  }`}>{itm.health}</span>
                </div>
                <div className="flex justify-between">
                  <span>LAST SYNC RUN</span>
                  <span className="text-stone-400 font-bold">{itm.lastSync}</span>
                </div>
              </div>
            </div>

            {/* Actions button */}
            <div className="border-t border-stone-900 pt-4 mt-5 flex justify-end gap-2.5">
              {itm.status === "Connected" && (
                <button
                  onClick={() => handleAction(itm.id, "Connected")}
                  className="bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-white border border-stone-800 text-[10px] font-mono font-bold px-3 py-2 rounded-lg transition-all"
                >
                  Configure
                </button>
              )}
              <button
                onClick={() => handleAction(itm.id, itm.status)}
                className={`text-[10px] font-mono font-black tracking-wide uppercase px-4 py-2 rounded-lg border transition-all ${
                  itm.status === "Connected"
                    ? "bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200"
                    : "bg-white text-black border-white hover:bg-stone-100 font-black"
                }`}
              >
                {itm.status === "Connected" ? "Disconnect" : "Connect Platform"}
              </button>
            </div>

          </div>
        ))}
      </div>

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
