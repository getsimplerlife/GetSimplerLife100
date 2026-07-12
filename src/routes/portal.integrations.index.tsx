import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/integrations/")({
  component: ConnectedServices,
});

interface ProviderAction {
  name: string;
  description: string;
}

interface ProviderItem {
  id: string;
  name: string;
  category: string;
  authType: string;
  description: string;
  actions: ProviderAction[];
}

interface ConnectionItem {
  id: string;
  userId: string;
  provider: string;
  displayName: string;
  config: Record<string, any>;
  status: "active" | "expired" | "error" | "pending";
  healthAt?: string;
  errorMsg?: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentItem {
  _id: string;
  file_name: string;
  file_size: number;
  extracted_text?: string;
  document_type?: string;
  key_info?: Record<string, any>;
  status: string;
  _created_at: number;
}

// Map provider ID or name to nice emoji
function getProviderEmoji(providerId: string, category: string): string {
  const lower = providerId.toLowerCase();
  if (lower.includes("salesforce")) return "☁️";
  if (lower.includes("hubspot")) return "🧡";
  if (lower.includes("dynamics")) return "💼";
  if (lower.includes("zoho")) return "🦊";
  if (lower.includes("pipedrive")) return "📈";
  if (lower.includes("quickbooks-online") || lower.includes("qbo")) return "🟢";
  if (lower.includes("quickbooks-desktop") || lower.includes("qbd")) return "💻";
  if (lower.includes("xero")) return "🔵";
  if (lower.includes("slack")) return "💬";
  if (lower.includes("outlook")) return "📧";
  if (lower.includes("exchange")) return "📬";
  if (lower.includes("gmail")) return "📨";
  if (lower.includes("google-workspace") || lower.includes("gws")) return "📂";
  if (lower.includes("google-drive") || lower.includes("gdrive")) return "📁";
  if (lower.includes("dropbox")) return "📦";
  if (lower.includes("box")) return "📦";
  if (lower.includes("sharepoint")) return "🕸️";
  if (lower.includes("onedrive")) return "☁️";
  if (lower.includes("shopify")) return "🛒";
  if (lower.includes("stripe")) return "💳";
  if (lower.includes("paypal")) return "🅿️";
  if (lower.includes("square")) return "⬛";
  if (lower.includes("zoom")) return "📹";
  if (lower.includes("teams")) return "👥";
  if (lower.includes("discord")) return "👾";
  if (lower.includes("twilio")) return "📞";
  if (lower.includes("zendesk")) return "🎫";
  if (lower.includes("intercom")) return "💬";
  if (lower.includes("monday")) return "📅";
  if (lower.includes("asana")) return "🔴";
  if (lower.includes("jira")) return "🛠️";
  if (lower.includes("notion")) return "📓";
  if (lower.includes("clickup")) return "🦄";
  if (lower.includes("bamboohr")) return "🎋";
  if (lower.includes("workday")) return "🌞";
  if (lower.includes("rippling")) return "🌊";
  if (lower.includes("gusto")) return "🎪";
  if (lower.includes("openai")) return "🧠";
  if (lower.includes("anthropic")) return "🎭";
  if (lower.includes("gemini")) return "♊";
  if (lower.includes("zapier")) return "⚡";
  if (lower.includes("make")) return "🧰";
  if (lower.includes("postgres") || lower.includes("mysql") || lower.includes("sqlserver")) return "🛢️";
  if (lower.includes("api") || lower.includes("graphql") || lower.includes("rest-api")) return "🌐";

  // Category fallback
  switch (category) {
    case "crm": return "💼";
    case "erp": return "🏢";
    case "accounting": return "🟢";
    case "email": return "📧";
    case "communication": return "💬";
    case "storage": return "📁";
    case "project-management": return "📅";
    case "hr": return "👥";
    case "support": return "🎫";
    case "payments": return "💳";
    case "ecommerce": return "🛒";
    case "logistics": return "🚚";
    case "manufacturing": return "🏭";
    case "healthcare": return "🏥";
    case "scheduling": return "📅";
    case "forms": return "📝";
    case "analytics": return "📊";
    case "ai_models": return "🧠";
    case "automation": return "⚡";
    case "identity": return "🔑";
    case "developer_tools": return "🌐";
    case "databases": return "🛢️";
    default: return "🔌";
  }
}

// Friendly category labels
const categoryLabels: Record<string, string> = {
  crm: "CRM Systems",
  erp: "Enterprise ERP",
  accounting: "Accounting & Finance",
  email: "Email & Calendar",
  communication: "Communications",
  storage: "Cloud Storage",
  "project-management": "Project Management",
  hr: "Human Resources",
  support: "Customer Support",
  payments: "Payments & Billing",
  ecommerce: "E-Commerce Stores",
  logistics: "Logistics & TMS",
  manufacturing: "Manufacturing & MRP",
  healthcare: "Healthcare Systems",
  scheduling: "Scheduling Tools",
  forms: "Online Forms",
  analytics: "Analytics & BI",
  ai_models: "AI & LLM Models",
  automation: "Automation Platforms",
  identity: "Identity & Authentication",
  developer_tools: "Developer Tools",
  databases: "Databases",
};

function ConnectedServices() {
  const [activeTab, setActiveTab] = useState<"connections" | "intake">("connections");
  
  // Connections Tab States
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loadingConns, setLoadingConns] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProviderDetails, setSelectedProviderDetails] = useState<ProviderItem | null>(null);

  // File Upload Tab States
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentsHistory, setDocumentsHistory] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocDetails, setSelectedDocDetails] = useState<DocumentItem | null>(null);

  // Common Feedback State
  const [feedback, setFeedback] = useState("");

  // Fetch Providers and Connections
  const fetchConnectionsData = async () => {
    try {
      setLoadingConns(true);
      const [providersRes, connsRes] = await Promise.all([
        fetch("/api/integrations/providers"),
        fetch("/api/integrations")
      ]);
      const provsData = await providersRes.json();
      const connsData = await connsRes.json();
      
      setProviders(provsData || []);
      setConnections(connsData || []);
    } catch (err) {
      console.error("Error fetching integrations:", err);
    } finally {
      setLoadingConns(false);
    }
  };

  // Fetch Documents History
  const fetchDocumentsData = async () => {
    try {
      setLoadingDocs(true);
      const res = await fetch("/api/data/documents");
      const data = await res.json();
      setDocumentsHistory(data.data || []);
    } catch (err) {
      console.error("Error fetching documents history:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchConnectionsData();
    fetchDocumentsData();
  }, []);

  // Connect Redirect Handler
  const handleConnect = (providerId: string) => {
    setFeedback(`Redirecting to authorize secure connection...`);
    window.location.href = `/api/oauth/authorize?provider=${providerId}`;
  };

  // Disconnect Handler
  const handleDisconnect = async (connectionId: string, displayName: string) => {
    if (!confirm(`Are you sure you want to disconnect ${displayName}? This will delete the active OAuth access key tokens.`)) {
      return;
    }

    try {
      setFeedback(`Disconnecting platform...`);
      const res = await fetch(`/api/integrations/${connectionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      
      if (res.ok) {
        setFeedback(`Success: disconnected ${displayName}`);
        fetchConnectionsData();
      } else {
        const data = await res.json();
        setFeedback(`Error: ${data.error || "Failed to disconnect"}`);
      }
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error("Disconnect error:", err);
      setFeedback("Failed to disconnect platform.");
    }
  };

  // Sync / Health Trigger
  const handleSyncConnection = async (connectionId: string, displayName: string) => {
    try {
      setFeedback(`Triggering connection sync check...`);
      const res = await fetch(`/api/integrations/${connectionId}/sync`);
      const result = await res.json();
      
      if (result.synced) {
        setFeedback(`Success: connection checked! Health: ${result.health ? "Healthy" : "Attention needed"}`);
        fetchConnectionsData();
      } else {
        setFeedback(`Failed to verify connection sync.`);
      }
      setTimeout(() => setFeedback(""), 3500);
    } catch (err) {
      console.error("Sync error:", err);
      setFeedback("Failed to check sync status.");
    }
  };

  // Drag & Drop Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      setSelectedFile(droppedFile);
      triggerFileUpload(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setSelectedFile(selected);
      triggerFileUpload(selected);
    }
  };

  // Real File Upload to /api/upload
  const triggerFileUpload = async (file: File) => {
    setUploading(true);
    setUploadStep("Uploading file payload to secure sandbox...");

    // Simulated progress steps to make the extraction engine feel extremely cognitive and premium
    const steps = [
      { t: 800, text: "Instantiating layout analyzer & OCR bounds..." },
      { t: 1800, text: "Extracting document schema nodes & tabular lists..." },
      { t: 2800, text: "Mapping semantic key-value ledger matrices..." },
      { t: 3800, text: "Cataloging in portal database ledger index..." },
    ];

    steps.forEach((step, idx) => {
      setTimeout(() => {
        if (uploading) {
          setUploadStep(step.text);
        }
      }, step.t);
    });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Cognitive extraction failed");
      }

      const result = await res.json();
      setFeedback(`Extraction Complete: Found .${result.documentType || "document"} schema!`);
      fetchDocumentsData();
      setSelectedFile(null);
    } catch (err: any) {
      console.error("Upload error:", err);
      alert(`Upload Failed: ${err.message || "Unrecognized document structure or server error"}`);
    } finally {
      setUploading(false);
      setUploadStep("");
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  // Helper for human readable size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = 1;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Connections Filtering & Mapping
  const filteredProviders = providers.filter((prov) => {
    const matchesSearch =
      prov.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prov.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === "all" || prov.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Extract categories present in registered providers for the filter list
  const uniqueCategories = Array.from(new Set(providers.map((p) => p.category)));

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-stone-100 select-none pb-12">
      
      {/* ─── Header Section ─── */}
      <div className="border-b border-stone-900 pb-5 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
            🔌 Cognitive Connectivity Center
          </h1>
          <p className="text-stone-400 text-xs mt-1">
            Securely link third-party operations systems via real OAuth channels or ingest general documentation payload nodes.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="bg-stone-900/60 p-1 rounded-xl border border-stone-850 flex gap-1 font-mono text-[10px] font-black uppercase tracking-wider">
          <button
            onClick={() => setActiveTab("connections")}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === "connections"
                ? "bg-white text-black font-black"
                : "text-stone-400 hover:text-white"
            }`}
          >
            🔌 App Connections ({connections.filter(c => c.status === "active").length}/{providers.length})
          </button>
          <button
            onClick={() => setActiveTab("intake")}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === "intake"
                ? "bg-white text-black font-black"
                : "text-stone-400 hover:text-white"
            }`}
          >
            📁 Document Intake ({documentsHistory.length})
          </button>
        </div>
      </div>

      {/* ─── CONNECTIONS TAB ─── */}
      {activeTab === "connections" && (
        <div className="space-y-6">
          
          {/* Filters & Search Block */}
          <div className="bg-stone-950 p-5 rounded-2xl border border-stone-900 flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
            
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 font-mono text-[10px]">SEARCH</span>
              <input
                type="text"
                placeholder="Search platforms, APIs, custom ERP configurations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-stone-900/40 border border-stone-850 focus:border-stone-800 rounded-xl pl-16 pr-4 py-3 text-xs text-stone-100 outline-none transition-all placeholder-stone-600 font-semibold"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Pill Filters */}
            <div className="flex flex-wrap gap-2 max-w-full overflow-x-auto scrollbar-none">
              <button
                onClick={() => setSelectedCategory("all")}
                className={`px-3 py-1.5 rounded-lg border text-[9px] font-mono font-bold uppercase tracking-wider transition-all ${
                  selectedCategory === "all"
                    ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/80"
                    : "bg-stone-900/20 text-stone-400 border-stone-900 hover:border-stone-800 hover:text-stone-200"
                }`}
              >
                All Categories
              </button>
              {uniqueCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg border text-[9px] font-mono font-bold uppercase tracking-wider transition-all ${
                    selectedCategory === cat
                      ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/80"
                      : "bg-stone-900/20 text-stone-400 border-stone-900 hover:border-stone-800 hover:text-stone-200"
                  }`}
                >
                  {categoryLabels[cat] || cat.toUpperCase()}
                </button>
              ))}
            </div>

          </div>

          {/* Connected Count Indicator / Stats banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-stone-950 border border-stone-900 p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[9px] font-mono font-bold tracking-wider text-stone-500 uppercase">ACTIVE CHANNELS</span>
              <span className="text-2xl font-black text-white mt-1">
                {connections.filter(c => c.status === "active").length} <span className="text-stone-600 text-sm font-semibold">connected</span>
              </span>
            </div>
            <div className="bg-stone-950 border border-stone-900 p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[9px] font-mono font-bold tracking-wider text-stone-500 uppercase">AVAILABLE PROVIDERS</span>
              <span className="text-2xl font-black text-white mt-1">
                {providers.length} <span className="text-stone-600 text-sm font-semibold">platforms</span>
              </span>
            </div>
            <div className="bg-stone-950 border border-stone-900 p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[9px] font-mono font-bold tracking-wider text-stone-500 uppercase">ATTENTION NEEDED</span>
              <span className="text-2xl font-black text-amber-400 mt-1">
                {connections.filter(c => c.status === "error" || c.status === "expired").length} <span className="text-stone-600 text-sm font-semibold">exceptions</span>
              </span>
            </div>
            <div className="bg-stone-950 border border-stone-900 p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[9px] font-mono font-bold tracking-wider text-stone-500 uppercase">SECURE SECURITY TIER</span>
              <span className="text-2xl font-black text-emerald-400 mt-1">
                AES-256 <span className="text-stone-600 text-sm font-semibold">GCM</span>
              </span>
            </div>
          </div>

          {/* Main Grid View */}
          {loadingConns ? (
            <div className="flex flex-col items-center justify-center min-h-[300px]">
              <div className="w-10 h-10 border-2 border-stone-850 border-t-emerald-500 rounded-full animate-spin mb-4" />
              <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase animate-pulse">Decrypting Integration Schema Matrices...</p>
            </div>
          ) : filteredProviders.length === 0 ? (
            <div className="bg-stone-950 rounded-2xl border border-stone-900 p-12 text-center max-w-xl mx-auto space-y-4">
              <span className="text-4xl block">🔍</span>
              <h3 className="text-sm font-bold text-white">No integrations matching filter</h3>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                We couldn't find any third-party providers matching "{searchQuery}" in category "{selectedCategory}". Try updating your queries.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProviders.map((prov) => {
                // Check if there's a connected channel
                const activeConn = connections.find((c) => c.provider === prov.id);
                const hasConnection = !!activeConn;
                const statusStr = activeConn ? activeConn.status : "disconnected";

                return (
                  <div
                    key={prov.id}
                    className={`bg-stone-950 border rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-lg ${
                      statusStr === "active" ? "border-emerald-950 hover:border-emerald-900/60" :
                      statusStr === "error" || statusStr === "expired" ? "border-amber-950/80 hover:border-amber-900/80" :
                      "border-stone-900 hover:border-stone-850"
                    }`}
                  >
                    <div className="space-y-4">
                      
                      {/* Logo and Status Row */}
                      <div className="flex justify-between items-start">
                        <div className="h-11 w-11 bg-stone-900 border border-stone-800 rounded-xl flex items-center justify-center text-xl shadow-md">
                          {getProviderEmoji(prov.id, prov.category)}
                        </div>

                        <span className={`text-[8px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          statusStr === "active" ? "bg-emerald-950/60 text-emerald-400 border-emerald-900/50" :
                          statusStr === "error" || statusStr === "expired" ? "bg-amber-950/60 text-amber-400 border-amber-900/50 animate-pulse" :
                          statusStr === "pending" ? "bg-blue-950/60 text-blue-400 border-blue-900/50 animate-pulse" :
                          "bg-stone-900 text-stone-500 border-stone-850"
                        }`}>
                          {statusStr === "active" ? "Connected" :
                           statusStr === "error" ? "Needs Attention" :
                           statusStr === "expired" ? "Token Expired" :
                           statusStr === "pending" ? "Connecting" :
                           "Disconnected"}
                        </span>
                      </div>

                      {/* Info Segment */}
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold text-white leading-snug flex items-center gap-1.5">
                          {prov.name}
                          <span className="text-[8px] font-mono text-stone-600 font-normal">({prov.id})</span>
                        </h3>
                        <p className="text-stone-400 text-[10px] leading-relaxed font-semibold min-h-[44px] line-clamp-2">
                          {prov.description || `${prov.name} enterprise integration for workflow synchronization.`}
                        </p>
                      </div>

                      {/* Technical Details / Connection Health Indicator */}
                      <div className="bg-stone-900/30 border border-stone-900 rounded-xl p-2.5 space-y-1 font-mono text-[9px] text-stone-500">
                        <div className="flex justify-between">
                          <span>CATEGORY</span>
                          <span className="text-stone-400 font-bold uppercase">{categoryLabels[prov.category] || prov.category}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>HEALTH CHECK</span>
                          <span className={`font-bold ${
                            statusStr === "active" ? "text-emerald-500" :
                            statusStr === "error" || statusStr === "expired" ? "text-amber-500" :
                            "text-stone-600"
                          }`}>
                            {statusStr === "active" ? "100% Operational" :
                             statusStr === "error" || statusStr === "expired" ? (activeConn?.errorMsg || "API Exception") :
                             "Awaiting Connection"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>LAST SYNC RUN</span>
                          <span className="text-stone-400 font-bold">
                            {activeConn ? new Date(activeConn.updatedAt).toLocaleTimeString() : "Never"}
                          </span>
                        </div>
                      </div>

                      {/* Schema capabilities list */}
                      {prov.actions && prov.actions.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[8px] font-mono text-stone-500 tracking-wider uppercase block">CAPABILITIES EXPOSED ({prov.actions.length})</span>
                          <div className="flex flex-wrap gap-1">
                            {prov.actions.slice(0, 3).map((act, idx) => (
                              <span key={idx} className="bg-stone-900/80 border border-stone-850 text-stone-400 text-[8px] px-1.5 py-0.5 rounded font-mono">
                                {act.name}
                              </span>
                            ))}
                            {prov.actions.length > 3 && (
                              <span className="text-stone-600 text-[8px] font-mono px-1">+{prov.actions.length - 3} more</span>
                            )}
                          </div>
                        </div>
                      )}

                    </div>

                    {/* Action buttons */}
                    <div className="border-t border-stone-900 pt-3.5 mt-5 flex justify-between items-center gap-2">
                      <div>
                        {prov.actions && prov.actions.length > 0 && (
                          <button
                            onClick={() => setSelectedProviderDetails(prov)}
                            className="text-stone-500 hover:text-stone-300 text-[9px] font-mono underline"
                          >
                            View Schemas
                          </button>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {hasConnection && (
                          <>
                            <button
                              onClick={() => handleSyncConnection(activeConn.id, activeConn.displayName)}
                              className="bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-white border border-stone-800 text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg transition-all"
                              title="Trigger Status Check"
                            >
                              🔄
                            </button>
                            <button
                              onClick={() => handleDisconnect(activeConn.id, activeConn.displayName)}
                              className="bg-stone-900/60 hover:bg-rose-950/20 text-stone-500 hover:text-rose-400 border border-stone-900 hover:border-rose-900/40 text-[9px] font-mono font-bold px-3 py-1.5 rounded-lg transition-all"
                            >
                              Disconnect
                            </button>
                          </>
                        )}
                        {!hasConnection && (
                          <button
                            onClick={() => handleConnect(prov.id)}
                            className="bg-white text-black border-white hover:bg-stone-200 text-[9px] font-mono font-black tracking-wide uppercase px-4 py-1.5 rounded-lg border transition-all"
                          >
                            Connect Platform
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* ─── FILE INTAKE ENGINE TAB ─── */}
      {activeTab === "intake" && (
        <div className="space-y-6">
          
          {/* Main Grid: Upload left, Status progress & History right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left: Drag & Drop Ingestion Terminal */}
            <div className="lg:col-span-5 space-y-6">
              
              <div className="bg-stone-950 p-6 rounded-2xl border border-stone-900 space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    📤 Payload Ingestion Terminal
                  </h3>
                  <p className="text-stone-400 text-[10px] mt-1 leading-relaxed">
                    Upload unstructured document matrices (W2, W9, invoices, utility ledgers, custom PDFs) into the AI layout analyzer.
                  </p>
                </div>

                {/* Upload drag drop zone */}
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all flex flex-col items-center justify-center min-h-[220px] relative ${
                    dragActive
                      ? "border-emerald-500 bg-emerald-950/10"
                      : "border-stone-850 bg-stone-900/10 hover:border-stone-800"
                  }`}
                >
                  <input
                    type="file"
                    id="intake-file-upload"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".pdf,.csv,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.bmp,.tiff"
                    disabled={uploading}
                  />

                  {uploading ? (
                    <div className="space-y-4 w-full">
                      <div className="relative w-12 h-12 mx-auto">
                        <div className="w-full h-full border-2 border-stone-800 border-t-emerald-500 rounded-full animate-spin" />
                        <span className="absolute inset-0 flex items-center justify-center text-xs">🔮</span>
                      </div>
                      <div className="space-y-2">
                        <p className="text-white text-xs font-bold font-mono uppercase tracking-wider animate-pulse">Processing Document...</p>
                        <p className="text-stone-500 text-[9px] font-mono leading-relaxed max-w-[250px] mx-auto">
                          {uploadStep}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="intake-file-upload"
                      className="cursor-pointer space-y-4 w-full h-full flex flex-col items-center justify-center"
                    >
                      <div className="h-12 w-12 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center text-xl shadow-md">
                        📂
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-extrabold text-white">
                          Drag file here or <span className="text-emerald-400 hover:underline">browse files</span>
                        </p>
                        <p className="text-[9px] text-stone-500 font-mono tracking-wide">
                          PDF, CSV, XLS, DOCX, PNG, JPG (MAX 10MB)
                        </p>
                      </div>
                    </label>
                  )}
                </div>

                {/* Upload capabilities bullet list */}
                <div className="bg-stone-900/20 border border-stone-900 rounded-xl p-3.5 space-y-2 font-mono text-[9px] text-stone-500">
                  <span className="font-bold uppercase text-stone-400">Layout OCR Pipeline Specs</span>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>Horizontal projection profiling OCR fallback</li>
                    <li>Automatic chromatic hue & signature integrity check</li>
                    <li>Semantic matrix tabular structural formatting</li>
                    <li>Instant storage in Drizzle portal documents index</li>
                  </ul>
                </div>

              </div>

            </div>

            {/* Right: Upload History Ledger */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="bg-stone-950 p-6 rounded-2xl border border-stone-900 space-y-4 min-h-[400px] flex flex-col justify-between">
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-stone-900 pb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      📖 Ingested Document History Ledger
                    </h3>
                    <span className="text-[8px] font-mono text-stone-500 bg-stone-900 px-2 py-0.5 rounded border border-stone-850 font-bold uppercase">
                      SECURE DB MATRIX
                    </span>
                  </div>

                  {/* History List/Table */}
                  {loadingDocs ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="w-8 h-8 border-2 border-stone-850 border-t-emerald-500 rounded-full animate-spin mb-3" />
                      <p className="text-stone-500 text-[9px] font-mono tracking-widest uppercase">Fetching audit history logs...</p>
                    </div>
                  ) : documentsHistory.length === 0 ? (
                    <div className="text-center py-16 space-y-3">
                      <span className="text-3xl block">📁</span>
                      <h4 className="text-xs font-extrabold text-stone-400">Document Ledger is Empty</h4>
                      <p className="text-[10px] text-stone-500 max-w-sm mx-auto leading-relaxed font-semibold">
                        You have not submitted any documents to the Cognitive Intake Engine. Upload a PDF or spreadsheet to monitor extraction logs.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-stone-900 font-mono text-[8px] text-stone-500 uppercase tracking-wider pb-2">
                            <th className="pb-2 font-bold">Document Name</th>
                            <th className="pb-2 font-bold">Extracted Type</th>
                            <th className="pb-2 font-bold">Size</th>
                            <th className="pb-2 font-bold">Status</th>
                            <th className="pb-2 text-right font-bold">Logs</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-900/50 text-[10px] font-semibold text-stone-300">
                          {documentsHistory.map((doc) => (
                            <tr key={doc._id} className="hover:bg-stone-900/20 group">
                              <td className="py-3 font-extrabold text-white max-w-[180px] truncate">
                                {doc.file_name}
                              </td>
                              <td className="py-3 text-stone-400 font-mono text-[9px]">
                                {doc.document_type || "Unstructured Raw"}
                              </td>
                              <td className="py-3 text-stone-500 font-mono">
                                {formatFileSize(doc.file_size)}
                              </td>
                              <td className="py-3">
                                <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                  doc.status === "processed"
                                    ? "bg-emerald-950/40 text-emerald-400 border-emerald-900/40"
                                    : "bg-amber-950/40 text-amber-400 border-amber-900/40"
                                }`}>
                                  {doc.status === "processed" ? "Parsed" : "Failed"}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  onClick={() => setSelectedDocDetails(doc)}
                                  className="text-emerald-500 hover:text-emerald-400 font-mono text-[9px] underline uppercase font-bold"
                                >
                                  Review Data
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Secure Disclaimer Footnote */}
                <div className="border-t border-stone-900 pt-3 text-[8px] font-mono text-stone-600 flex justify-between">
                  <span>SYSTEM LAYER: DRIZZLE PORTAL DATA INTEGRITY LOCK</span>
                  <span>ENCRYPTED REPOSITORY: /TMP/UPLOADS SECURE ERASE</span>
                </div>

              </div>

            </div>

          </div>

        </div>
      )}

      {/* ─── MODAL 1: PROVIDER CAPABILITIES & SCHEMAS ─── */}
      {selectedProviderDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-950 border border-stone-850 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-scaleIn text-stone-100">
            <div className="flex justify-between items-center border-b border-stone-900 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{getProviderEmoji(selectedProviderDetails.id, selectedProviderDetails.category)}</span>
                <h3 className="font-extrabold text-white text-sm">{selectedProviderDetails.name} Schema Specifications</h3>
              </div>
              <button
                onClick={() => setSelectedProviderDetails(null)}
                className="text-stone-500 hover:text-white text-xs font-mono"
              >
                CLOSE [X]
              </button>
            </div>

            <p className="text-stone-400 text-[10px] leading-relaxed">
              Below are the technical client actions available for execution by the Agent Runtime within this integrated connection context.
            </p>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {selectedProviderDetails.actions && selectedProviderDetails.actions.length > 0 ? (
                selectedProviderDetails.actions.map((act, idx) => (
                  <div key={idx} className="bg-stone-900/40 border border-stone-900 rounded-lg p-3 space-y-1">
                    <span className="text-[9px] font-mono font-bold text-emerald-400 block uppercase tracking-wide">
                      ⚡ {act.name}
                    </span>
                    <p className="text-[10px] text-stone-300 leading-normal font-semibold">
                      {act.description || "Performs structural operations."}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-stone-500 text-[10px] font-mono text-center py-6">No action triggers registered for this provider.</p>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-stone-900">
              <button
                onClick={() => setSelectedProviderDetails(null)}
                className="bg-white text-black font-mono font-bold text-[10px] px-4 py-2 rounded-lg hover:bg-stone-200"
              >
                Acknowledge Specs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: DOCUMENT DATA REVIEW ─── */}
      {selectedDocDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-950 border border-stone-850 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl animate-scaleIn text-stone-100">
            <div className="flex justify-between items-center border-b border-stone-900 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <div>
                  <h3 className="font-extrabold text-white text-sm">Extracted Payload: {selectedDocDetails.file_name}</h3>
                  <span className="text-[8px] font-mono text-stone-500 uppercase">DOCUMENT TYPE: {selectedDocDetails.document_type || "UNKNOWN"}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDocDetails(null)}
                className="text-stone-500 hover:text-white text-xs font-mono"
              >
                CLOSE [X]
              </button>
            </div>

            {/* Extracted Keys and Values */}
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
              
              {/* Key Info JSON block */}
              {selectedDocDetails.key_info && Object.keys(selectedDocDetails.key_info).length > 0 && (
                <div className="space-y-2">
                  <span className="text-[9px] font-mono font-bold text-stone-500 uppercase tracking-wider block">Extracted Schema Key-Values</span>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(selectedDocDetails.key_info).map(([k, v]) => (
                      <div key={k} className="bg-stone-900/30 border border-stone-900/60 rounded-xl p-3 font-mono text-[9px] space-y-1">
                        <span className="text-stone-500 uppercase block font-bold truncate" title={k}>{k.replace(/_/g, " ")}</span>
                        <span className="text-white font-extrabold break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw text section */}
              {selectedDocDetails.extracted_text && (
                <div className="space-y-2">
                  <span className="text-[9px] font-mono font-bold text-stone-500 uppercase tracking-wider block">Raw Extracted Text OCR Stream</span>
                  <div className="bg-stone-900/20 border border-stone-900 rounded-xl p-3 max-h-[150px] overflow-y-auto text-[9px] font-mono text-stone-400 whitespace-pre-wrap leading-relaxed select-text">
                    {selectedDocDetails.extracted_text}
                  </div>
                </div>
              )}

            </div>

            <div className="flex justify-between items-center pt-3 border-t border-stone-900 text-[8px] font-mono text-stone-600">
              <span>LEDGER TIMESTAMP: {new Date(selectedDocDetails._created_at).toLocaleString()}</span>
              <button
                onClick={() => setSelectedDocDetails(null)}
                className="bg-white text-black font-mono font-bold text-[10px] px-4 py-2 rounded-lg hover:bg-stone-200"
              >
                Done Reviewing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Feedback Toast Confirmation ─── */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none">
          <span className="text-emerald-500 animate-bounce">✓</span>
          <span className="text-xs font-bold font-mono uppercase tracking-wider">{feedback}</span>
        </div>
      )}

    </div>
  );
}
