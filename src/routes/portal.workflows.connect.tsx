import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

export const Route = createFileRoute("/portal/workflows/connect")({
  component: ConnectAI,
});

// ── Types ────────────────────────────────────────────────────────────────

interface IntegrationSummary {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface AgentLink {
  id: string;
  agentId: string;
  agentName: string;
  agentType: string;
  agentStatus: string;
  integrationId: string;
  integrationName: string;
  integrationCategory: string;
  config: Record<string, any>;
  createdAt: string;
}

interface AgentWithLinks {
  agentId: string;
  agentName: string;
  agentType: string;
  agentStatus: string;
  description: string;
  links: AgentLink[];
  availableIntegrations: IntegrationSummary[];
}

interface MappingData {
  agents: AgentWithLinks[];
  unlinkedIntegrations: IntegrationSummary[];
}

const CATEGORY_COLORS: Record<string, string> = {
  CRM: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Accounting: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  Communication: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Storage: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "Project Mgmt": "bg-rose-500/20 text-rose-400 border-rose-500/30",
  "E-commerce": "bg-pink-500/20 text-pink-400 border-pink-500/30",
  HR: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Support: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  Healthcare: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Dev & Data": "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
};

function categoryBadge(cat: string) {
  return CATEGORY_COLORS[cat] || "bg-stone-500/20 text-stone-400 border-stone-500/30";
}

// ── Component ─────────────────────────────────────────────────────────────

function ConnectAI() {
  const [mapping, setMapping] = useState<MappingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [assigningTo, setAssigningTo] = useState<string | null>(null);
  const [showAvailable, setShowAvailable] = useState(false);
  const [error, setError] = useState("");

  const fetchMapping = useCallback(async () => {
    try {
      const res = await fetch("/api/connect-ai/mapping", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load mapping");
      const data = await res.json();
      setMapping(data);
      setLoading(false);
    } catch (err) {
      setError("Failed to load connection mapping");
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMapping(); }, [fetchMapping]);

  const handleLink = async (agentId: string, integration: IntegrationSummary) => {
    try {
      setFeedback(`Connecting agent to ${integration.name}...`);
      const res = await fetch("/api/connect-ai/mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agentId,
          integrationId: integration.id,
          integrationName: integration.name,
          integrationCategory: integration.category,
          config: { autoSync: true, syncInterval: "5min" },
        }),
      });
      if (!res.ok) throw new Error("Failed to link");
      setFeedback(`Connected to ${integration.name}!`);
      setAssigningTo(null);
      fetchMapping();
      setTimeout(() => setFeedback(""), 2500);
    } catch {
      setFeedback("Failed to create connection");
      setTimeout(() => setFeedback(""), 2500);
    }
  };

  const handleUnlink = async (linkId: string) => {
    try {
      setFeedback("Removing connection...");
      const res = await fetch(`/api/connect-ai/mapping/${linkId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      setFeedback("Connection removed");
      fetchMapping();
      setTimeout(() => setFeedback(""), 2500);
    } catch {
      setFeedback("Failed to remove connection");
      setTimeout(() => setFeedback(""), 2500);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-stone-800 border-t-blue-500 rounded-full animate-spin mx-auto" />
          <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Loading connections...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-stone-500 text-xs">{error}</p>
        <button onClick={fetchMapping} className="mt-4 text-blue-400 text-xs font-bold hover:underline">Retry</button>
      </div>
    );
  }

  if (!mapping || mapping.agents.length === 0) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <Header />
        <div className="flex flex-col items-center justify-center py-16 text-center bg-stone-950 border border-stone-900 rounded-2xl">
          <div className="text-4xl mb-4">🔌</div>
          <h3 className="text-lg font-bold text-white mb-2">No AI agents deployed yet</h3>
          <p className="text-sm text-stone-400 mb-6 max-w-sm">
            Deploy AI agents from the marketplace, then return here to connect them to your integrations.
          </p>
          <Link
            to="/portal/employees"
            className="bg-white hover:bg-stone-200 text-black font-bold text-xs px-5 py-3 rounded-xl transition-all"
          >
            Deploy AI Employees →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-stone-100">
      <Header />

      {/* ─── Quick Stats ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="🤖" label="AI Agents" value={mapping.agents.length} />
        <StatCard
          icon="🔗"
          label="Connections"
          value={mapping.agents.reduce((s, a) => s + a.links.length, 0)}
        />
        <StatCard
          icon="📦"
          label="Available Integrations"
          value={mapping.unlinkedIntegrations.length}
        />
        <StatCard
          icon="🟢"
          label="Active Agents"
          value={mapping.agents.filter(a => a.agentStatus === "active").length}
        />
      </div>

      {/* ─── Agent Cards Grid ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-stone-300 uppercase tracking-wider">Deployed AI Agents</h2>
          <button
            onClick={() => setShowAvailable(!showAvailable)}
            className="text-[10px] font-mono text-stone-500 hover:text-stone-300 transition-colors"
          >
            {showAvailable ? "Hide available integrations" : "Show available integrations"}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {mapping.agents.map((agent) => (
            <div
              key={agent.agentId}
              className={`bg-stone-950 border rounded-2xl p-5 transition-all ${
                selectedAgent === agent.agentId
                  ? "border-blue-500/50 ring-1 ring-blue-500/20"
                  : "border-stone-900 hover:border-stone-800"
              }`}
              onClick={() => setSelectedAgent(agent.agentId === selectedAgent ? null : agent.agentId)}
            >
              {/* Agent Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{agentIcon(agent.agentType)}</span>
                    <h3 className="text-sm font-black text-white">{agent.agentName}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-stone-500">
                      {agent.agentType.replace(/_/g, " ")}
                    </span>
                    <StatusDot status={agent.agentStatus} />
                  </div>
                </div>
                {/* Connect button */}
                {assigningTo === agent.agentId ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setAssigningTo(null); }}
                    className="text-[10px] font-bold text-stone-400 hover:text-white px-2 py-1 rounded-lg bg-stone-900 border border-stone-800"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssigningTo(agent.agentId);
                      setSelectedAgent(agent.agentId);
                    }}
                    disabled={agent.availableIntegrations.length === 0}
                    className="text-[10px] font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-stone-800 disabled:text-stone-600 text-white px-3 py-1.5 rounded-lg transition-all"
                  >
                    + Connect
                  </button>
                )}
              </div>

              {/* Connection Lines */}
              {agent.links.length > 0 ? (
                <div className="space-y-2 mb-3">
                  <p className="text-[9px] font-bold text-stone-600 uppercase tracking-wider">Connected To</p>
                  {agent.links.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between bg-stone-900/50 border border-stone-800 rounded-xl px-3 py-2 group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: CATEGORY_COLORS[link.integrationCategory]?.split(" ")[0]?.replace("bg-", "#").replace("/20", "") || "#6b7280" }}
                        />
                        <span className="text-[11px] font-medium text-stone-300 truncate">{link.integrationName}</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-mono ${categoryBadge(link.integrationCategory)}`}>
                          {link.integrationCategory}
                        </span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleUnlink(link.id); }}
                        className="opacity-0 group-hover:opacity-100 text-[9px] text-rose-400 hover:text-rose-300 font-medium transition-all ml-2 shrink-0"
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-3 border border-dashed border-stone-800 rounded-xl mb-3">
                  <p className="text-[10px] text-stone-600 font-medium">No connections yet</p>
                </div>
              )}

              {/* Available Integrations (shown when assigning) */}
              {assigningTo === agent.agentId && agent.availableIntegrations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-stone-900">
                  <p className="text-[9px] font-bold text-stone-500 uppercase tracking-wider mb-2">
                    Available to connect ({agent.availableIntegrations.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {agent.availableIntegrations.map((int) => (
                      <button
                        key={int.id}
                        onClick={(e) => { e.stopPropagation(); handleLink(agent.agentId, int); }}
                        className={`text-[9px] font-medium px-2 py-1 rounded-lg border transition-all hover:scale-105 ${categoryBadge(int.category)}`}
                      >
                        + {int.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Available Integrations Panel ─── */}
      {showAvailable && mapping.unlinkedIntegrations.length > 0 && (
        <div className="bg-stone-950 border border-stone-900 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-stone-300 uppercase tracking-wider mb-3">
            Available Integrations ({mapping.unlinkedIntegrations.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {mapping.unlinkedIntegrations.map((int) => (
              <div
                key={int.id}
                className={`text-center px-3 py-2 rounded-xl border text-[10px] font-medium ${categoryBadge(int.category)}`}
              >
                {int.name}
              </div>
            ))}
          </div>
          <p className="text-[9px] text-stone-600 mt-3">
            Click "+ Connect" on any agent above to link these integrations.
          </p>
        </div>
      )}

      {/* ─── Feedback Toast ─── */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-blue-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-blue-400">🔗</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}
    </div>
  );
}

// ── Helper Components ────────────────────────────────────────────────────

function Header() {
  return (
    <div className="border-b border-stone-900 pb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">🔗 Connect AI</h1>
        <p className="text-stone-400 text-xs mt-1">
          Map your AI agents to integrations — control which data sources each AI can access.
        </p>
      </div>
      <div className="flex gap-2">
        <Link
          to="/portal/workflows"
          className="bg-stone-900 hover:bg-stone-800 text-stone-300 text-xs font-bold px-4 py-2.5 rounded-xl border border-stone-800 transition-all"
        >
          ← Workflow Manager
        </Link>
        <Link
          to="/portal/employees"
          className="bg-white hover:bg-stone-200 text-black font-bold text-xs px-4 py-2.5 rounded-xl transition-all"
        >
          Deploy Agents
        </Link>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-[9px] font-bold text-stone-500 uppercase tracking-wider">{label}</p>
          <p className="text-lg font-black text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-500", running: "bg-emerald-500",
    paused: "bg-amber-500", idle: "bg-stone-500", error: "bg-rose-500",
  };
  return (
    <span className="flex items-center gap-1 text-[9px] text-stone-500">
      <span className={`h-1.5 w-1.5 rounded-full ${colors[status] || "bg-stone-600"}`} />
      {status}
    </span>
  );
}

function agentIcon(type: string): string {
  const icons: Record<string, string> = {
    document_intake: "📄", healthcare_intake: "🏥", invoice_ledger: "🧾",
    sales_outreach: "📈", hr_compliance: "👥", dispatch_logistics: "🚚",
    audit_logger: "📋", voice_receptionist: "📞", support_agent: "🎧",
    knowledge_assistant: "🧠", inventory_management: "📦", contract_management: "📝",
    customer_success: "⭐", project_management: "📊", procurement_vendor: "🤝",
    it_operations: "💻", fp_and_a: "💰", marketing_social: "📱",
  };
  return icons[type] || "🤖";
}
