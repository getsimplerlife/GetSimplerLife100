import { useState, useMemo, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { integrations, type Integration } from "../content/integrations";
import {
  getAuthMethod,
  getConnectLabel,
  AGENT_TYPES,
  type AuthMethod,
} from "../content/integration-auth-map";
import { db } from "../db/index";
import { integrations as integrationsTable } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getUser } from "../db/queries";

// ── Server Functions ───────────────────────────────────────────────

export interface UserConnection {
  id: string;
  provider: string;
  displayName: string;
  status: "active" | "expired" | "error" | "pending";
  assignedAgent: string | null;
  healthAt: string | null;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
}

const getUserConnections = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getUser();
  if (!user) return { connections: [] as UserConnection[] };

  const rows = await db.query.integrations.findMany({
    where: eq(integrationsTable.userId, user.id),
    orderBy: (integrationsTable, { desc }) => [desc(integrationsTable.updatedAt)],
  });

  const connections: UserConnection[] = rows.map((row) => {
    let config: Record<string, any> = {};
    try {
      config = JSON.parse(row.config);
    } catch { /* keep defaults */ }
    return {
      id: row.id,
      provider: row.provider,
      displayName: row.displayName,
      status: row.status as UserConnection["status"],
      assignedAgent: config.assigned_agent ?? null,
      healthAt: row.healthAt?.toISOString() ?? null,
      errorMsg: row.errorMsg ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  return { connections };
});

const createConnectionFn = createServerFn()
  .validator((data: { provider: string; displayName: string; apiKey: string; subdomain?: string }) => data)
  .handler(async ({ data }) => {
    const user = await getUser();
    if (!user) throw new Error("Unauthorized");
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(integrationsTable).values({
      id,
      userId: user.id,
      provider: data.provider,
      displayName: data.displayName,
      config: JSON.stringify({ apiKey: data.apiKey, subdomain: data.subdomain }),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { success: true, connectionId: id };
  });

const deleteConnectionFn = createServerFn()
  .validator((connectionId: string) => connectionId)
  .handler(async ({ data: connectionId }) => {
    const user = await getUser();
    if (!user) throw new Error("Unauthorized");
    await db.delete(integrationsTable).where(
      and(eq(integrationsTable.id, connectionId), eq(integrationsTable.userId, user.id)),
    );
    return { success: true };
  });

const setRoutingAgentFn = createServerFn()
  .validator((data: { connectionId: string; agentType: string | null }) => data)
  .handler(async ({ data }) => {
    const user = await getUser();
    if (!user) throw new Error("Unauthorized");
    const row = await db.query.integrations.findFirst({
      where: and(eq(integrationsTable.id, data.connectionId), eq(integrationsTable.userId, user.id)),
    });
    if (!row) throw new Error("Connection not found");
    let config: Record<string, any> = {};
    try { config = JSON.parse(row.config); } catch { /* empty */ }
    if (data.agentType === null) {
      delete config.assigned_agent;
    } else {
      config.assigned_agent = data.agentType;
    }
    await db.update(integrationsTable).set({
      config: JSON.stringify(config),
      updatedAt: new Date(),
    }).where(and(eq(integrationsTable.id, data.connectionId), eq(integrationsTable.userId, user.id)));
    return { success: true };
  });

export const Route = createFileRoute("/integrations/")({
  component: IntegrationCatalogPage,
});

// ── Types ──────────────────────────────────────────────────────────
interface ProviderCardData {
  integration: Integration;
  authMethod: AuthMethod;
  connectLabel: string;
  connection: UserConnection | null;
}

// ── Constants ──────────────────────────────────────────────────────
const AUTH_BADGE: Record<AuthMethod, { label: string; color: string }> = {
  oauth2: { label: "OAuth 2.0", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  api_key: { label: "API Key", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500",
  expired: "bg-amber-500",
  error: "bg-rose-500",
  pending: "bg-indigo-500 animate-pulse",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Connected",
  expired: "Expired",
  error: "Error",
  pending: "Pending",
};

// ── Component ──────────────────────────────────────────────────────
function IntegrationCatalogPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("ALL");
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [routingLoading, setRoutingLoading] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"catalog" | "connected">("catalog");

  // Load connections once
  useState(() => {
    getUserConnections().then(({ connections: conns }) => {
      setConnections(conns);
      setConnectionsLoaded(true);
    }).catch(() => setConnectionsLoaded(true));
  });

  // Connection lookup map
  const connectionMap = useMemo(() => {
    const map: Record<string, UserConnection> = {};
    for (const c of connections) {
      map[c.provider] = c;
    }
    return map;
  }, [connections]);

  // Categories derived from integrations
  const categories = useMemo(() => {
    const cats = new Set(integrations.map((i) => i.category.toUpperCase()));
    return ["ALL", ...Array.from(cats).sort()];
  }, []);

  // Filtered integrations
  const filteredIntegrations = useMemo(() => {
    const q = search.toLowerCase();
    let list = integrations.filter((i) => {
      const matchesCat = activeCategory === "ALL" || i.category.toUpperCase() === activeCategory;
      const matchesSearch =
        !q ||
        i.name.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });

    // Sort alphabetically
    list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [search, activeCategory]);

  // Connected-only view
  const connectedIntegrations = useMemo(() => {
    if (viewMode !== "connected") return [];
    return filteredIntegrations.filter((i) => connectionMap[i.id]);
  }, [viewMode, filteredIntegrations, connectionMap]);

  const displayList = viewMode === "connected" ? connectedIntegrations : filteredIntegrations;

  // Counts
  const totalCount = integrations.length;
  const connectedCount = connections.filter((c) => c.status === "active").length;
  const errorCount = connections.filter((c) => c.status === "error" || c.status === "expired").length;

  // Handlers
  const handleAssignAgent = useCallback(async (connectionId: string, agentType: string | null) => {
    setRoutingLoading(connectionId);
    try {
      await setRoutingAgentFn({ data: { connectionId, agentType } });
      // Refresh connections
      const { connections: fresh } = await getUserConnections();
      setConnections(fresh);
    } catch (err) {
      console.error("Failed to set routing:", err);
    } finally {
      setRoutingLoading(null);
    }
  }, []);

  const handleDisconnect = useCallback(async (connectionId: string) => {
    setDisconnectingId(connectionId);
    try {
      await deleteConnectionFn({ data: connectionId });
      const { connections: fresh } = await getUserConnections();
      setConnections(fresh);
    } catch (err) {
      console.error("Failed to disconnect:", err);
    } finally {
      setDisconnectingId(null);
    }
  }, []);

  const handleConnect = useCallback((provider: Integration, authMethod: AuthMethod) => {
    if (authMethod === "oauth2") {
      // Redirect to OAuth flow
      const redirectUri = `${window.location.origin}/integrations/oauth/callback?provider=${provider.id}`;
      alert(
        `🔐 OAuth 2.0 connection flow for ${provider.name}\n\nThis would redirect to ${provider.name}'s OAuth authorization page.\n\nRedirect URI: ${redirectUri}\n\n(Full OAuth flow implementation in progress — connect via API Key as an alternative.)`,
      );
    } else {
      // Show API key form
      setExpandedProvider(provider.id);
    }
  }, []);

  const connectedIds = useMemo(() => new Set(connections.map((c) => c.provider)), [connections]);

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-stone-900 bg-stone-950/80 backdrop-blur sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span className="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-black text-sm text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-all">
            S1
          </span>
          <span className="font-black text-base tracking-tight text-white group-hover:text-indigo-400 transition-colors">
            SIMPLER LIFE <span className="text-indigo-500 font-mono">100</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/workflows"
            className="text-xs font-mono font-bold text-stone-400 hover:text-white border border-stone-850 hover:border-stone-700 bg-stone-900/30 rounded-lg px-3.5 py-1.5 transition-all"
          >
            ← WORKFLOWS
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-6 pt-12 pb-8 text-center overflow-hidden border-b border-stone-900/50">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono font-bold tracking-wider">
            🔌 INTEGRATION CATALOG
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Connect Your <span className="text-indigo-400">Software Stack</span>
          </h1>
          <p className="text-stone-400 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
            {totalCount}+ integrations available. Connect via OAuth 2.0 or API key, monitor connection health, and route data to your AI Operations Team.
          </p>

          {/* Stats bar */}
          <div className="flex items-center justify-center gap-6 pt-4">
            <div className="text-center">
              <div className="text-2xl font-black text-white">{totalCount}</div>
              <div className="text-[10px] font-mono text-stone-500 uppercase">Providers</div>
            </div>
            <div className="w-px h-8 bg-stone-800" />
            <div className="text-center">
              <div className="text-2xl font-black text-emerald-400">{connectedCount}</div>
              <div className="text-[10px] font-mono text-stone-500 uppercase">Connected</div>
            </div>
            {errorCount > 0 && (
              <>
                <div className="w-px h-8 bg-stone-800" />
                <div className="text-center">
                  <div className="text-2xl font-black text-amber-400">{errorCount}</div>
                  <div className="text-[10px] font-mono text-stone-500 uppercase">Need Attention</div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <section className="sticky top-[73px] z-30 bg-stone-950/95 backdrop-blur border-b border-stone-900 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
          {/* View toggle */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode("catalog")}
              className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg transition-all ${
                viewMode === "catalog"
                  ? "bg-indigo-600 text-white"
                  : "bg-stone-900 text-stone-400 hover:text-stone-200"
              }`}
            >
              ALL PROVIDERS
            </button>
            <button
              onClick={() => setViewMode("connected")}
              className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "connected"
                  ? "bg-indigo-600 text-white"
                  : "bg-stone-900 text-stone-400 hover:text-stone-200"
              }`}
            >
              CONNECTED
              {connectedCount > 0 && (
                <span className="h-4 w-4 rounded-full bg-emerald-500 text-[9px] flex items-center justify-center text-white font-black">
                  {connectedCount}
                </span>
              )}
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 180+ providers..."
              className="w-full sm:w-64 bg-stone-900 border border-stone-800 focus:border-indigo-600 rounded-xl px-3.5 py-2 text-xs text-stone-200 outline-none placeholder:text-stone-600"
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="max-w-7xl mx-auto mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 text-[10px] font-mono font-bold px-2.5 py-1 rounded transition-colors ${
                activeCategory === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-stone-900 text-stone-500 hover:text-stone-300 hover:bg-stone-850"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Catalog Grid */}
      <section className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">
        {displayList.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="text-4xl text-stone-600">🔍</div>
            <h4 className="text-sm font-black text-white">No Providers Found</h4>
            <p className="text-xs text-stone-500">
              {viewMode === "connected"
                ? "No connected providers match your filters. Connect some providers first."
                : "Try adjusting your search or category filter."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayList.map((integration) => {
              const conn = connectionMap[integration.id];
              const authMethod = getAuthMethod(integration.id);
              const connectLabel = getConnectLabel(integration.id);
              const isExpanded = expandedProvider === integration.id;
              const isConnected = !!conn;
              const status = conn?.status ?? null;

              return (
                <div
                  key={integration.id}
                  className={`bg-stone-900/30 border rounded-2xl p-5 transition-all ${
                    isConnected
                      ? status === "active"
                        ? "border-emerald-500/20 hover:border-emerald-500/40"
                        : status === "error" || status === "expired"
                          ? "border-amber-500/20 hover:border-amber-500/40"
                          : "border-indigo-500/20 hover:border-indigo-500/40"
                      : "border-stone-850 hover:border-stone-700"
                  }`}
                >
                  {/* Top row: name + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm text-white truncate">
                          {integration.name}
                        </h4>
                        {/* Status indicator */}
                        {isConnected && status && (
                          <span className="flex items-center gap-1 shrink-0">
                            <span className={`inline-block h-2 w-2 rounded-full ${STATUS_STYLES[status] || "bg-stone-600"}`} />
                            <span className="text-[10px] font-mono font-bold text-stone-400">
                              {STATUS_LABELS[status] || status}
                            </span>
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-stone-500 mt-0.5 uppercase tracking-wider">
                        {integration.category}
                      </p>
                    </div>

                    {/* Auth type badge */}
                    <span
                      className={`shrink-0 text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
                        AUTH_BADGE[authMethod].color
                      }`}
                    >
                      {AUTH_BADGE[authMethod].label}
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-stone-400 mt-3 line-clamp-2 leading-relaxed">
                    {integration.description}
                  </p>

                  {/* Capabilities preview */}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {integration.capabilities.slice(0, 2).map((cap, i) => (
                      <span
                        key={i}
                        className="text-[9px] text-stone-500 bg-stone-950/50 border border-stone-850 px-1.5 py-0.5 rounded"
                      >
                        {cap.length > 60 ? cap.slice(0, 60) + "…" : cap}
                      </span>
                    ))}
                    {integration.capabilities.length > 2 && (
                      <span className="text-[9px] text-stone-600">
                        +{integration.capabilities.length - 2} more
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="mt-4 pt-3 border-t border-stone-850/60 flex items-center justify-between gap-2">
                    {isConnected ? (
                      <>
                        {/* Connected: show routing & disconnect */}
                        <button
                          onClick={() =>
                            setExpandedProvider(isExpanded ? null : integration.id)
                          }
                          className="text-[10px] font-mono font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          {isExpanded ? "▼ ROUTING" : "▶ ROUTING"}
                        </button>
                        <button
                          onClick={() => handleDisconnect(conn.id)}
                          disabled={disconnectingId === conn.id}
                          className="text-[10px] font-mono font-bold text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 bg-rose-500/5 rounded-lg px-3 py-1.5 transition-all disabled:opacity-50"
                        >
                          {disconnectingId === conn.id ? "…" : "Disconnect"}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleConnect(integration, authMethod)}
                        className={`w-full text-[10px] font-mono font-bold py-1.5 rounded-lg transition-all ${
                          authMethod === "oauth2"
                            ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                            : "bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700"
                        }`}
                      >
                        {connectLabel}
                      </button>
                    )}
                  </div>

                  {/* Expanded: API Key form or Routing */}
                  {isExpanded && !isConnected && authMethod === "api_key" && (
                    <ApiKeyForm
                      providerId={integration.id}
                      providerName={integration.name}
                      onConnected={() => {
                        getUserConnections().then(({ connections: c }) => setConnections(c));
                        setExpandedProvider(null);
                      }}
                      onCancel={() => setExpandedProvider(null)}
                    />
                  )}

                  {isExpanded && isConnected && conn && (
                    <RoutingPanel
                      connection={conn}
                      onAssign={(agentType) => handleAssignAgent(conn.id, agentType)}
                      loading={routingLoading === conn.id}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-900 bg-stone-950/60 py-6 text-center text-xs font-mono text-stone-600">
        © 2026 Simpler Life 100 — Autonomous Operations Engineering.
      </footer>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function ApiKeyForm({
  providerId,
  providerName,
  onConnected,
  onCancel,
}: {
  providerId: string;
  providerName: string;
  onConnected: () => void;
  onCancel: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createConnectionFn({
        data: {
          provider: providerId,
          displayName: providerName,
          apiKey: apiKey.trim(),
          subdomain: subdomain.trim() || undefined,
        },
      });
      onConnected();
    } catch (err: any) {
      setError(err.message || "Failed to connect");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 pt-3 border-t border-stone-850/60 space-y-3">
      <p className="text-[10px] font-mono font-bold text-stone-400 uppercase">
        Configure API Key for {providerName}
      </p>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Enter API Key…"
        className="w-full bg-stone-950 border border-stone-800 focus:border-indigo-600 rounded-lg px-3 py-2 text-xs text-stone-200 outline-none placeholder:text-stone-600"
      />
      <input
        type="text"
        value={subdomain}
        onChange={(e) => setSubdomain(e.target.value)}
        placeholder="Subdomain / Instance URL (optional)"
        className="w-full bg-stone-950 border border-stone-800 focus:border-indigo-600 rounded-lg px-3 py-2 text-xs text-stone-200 outline-none placeholder:text-stone-600"
      />
      {error && (
        <p className="text-[10px] text-rose-400 font-mono">{error}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold py-1.5 rounded-lg transition-all disabled:opacity-50"
        >
          {submitting ? "Connecting…" : "Connect"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-[10px] font-mono text-stone-500 hover:text-stone-300 border border-stone-800 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function RoutingPanel({
  connection,
  onAssign,
  loading,
}: {
  connection: UserConnection;
  onAssign: (agentType: string | null) => void;
  loading: boolean;
}) {
  const currentAgent = connection.assignedAgent;
  const currentAgentName = AGENT_TYPES.find((a) => a.id === currentAgent)?.name ?? null;

  return (
    <div className="mt-4 pt-3 border-t border-stone-850/60 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-mono font-bold text-stone-400 uppercase">
          Data Routing → AI Agent
        </p>
        {currentAgentName && (
          <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
            {currentAgentName}
          </span>
        )}
      </div>
      <p className="text-[10px] text-stone-500 leading-relaxed">
        Route data from this connection to a specific AI agent for automated processing.
      </p>
      <select
        value={currentAgent || ""}
        onChange={(e) => {
          const val = e.target.value || null;
          onAssign(val);
        }}
        disabled={loading}
        className="w-full bg-stone-950 border border-stone-800 focus:border-indigo-600 rounded-lg px-3 py-2 text-xs text-stone-200 outline-none disabled:opacity-50"
      >
        <option value="">— Select AI Agent —</option>
        <option value="">(No routing / unassigned)</option>
        {AGENT_TYPES.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      {loading && (
        <p className="text-[10px] text-indigo-400 font-mono animate-pulse">
          Updating routing…
        </p>
      )}
    </div>
  );
}
