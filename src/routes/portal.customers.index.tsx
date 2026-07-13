import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, Badge, Button, Input } from "~/components/ui";

export const Route = createFileRoute("/portal/customers/")({
  component: CustomerManagement,
});

interface Contact {
  _id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  type: "Customer" | "Vendor" | "Supplier" | "Partner";
  status: "Active" | "Paused";
  notes: string;
  aiInsights?: string;
}

interface CRMProvider {
  id: string;
  name: string;
  category: string;
  authType: string;
  description: string;
}

interface CRMConnection {
  id: string;
  provider: string;
  displayName: string;
  status: string;
}

function CustomerManagement() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [providers, setProviders] = useState<CRMProvider[]>([]);
  const [connections, setConnections] = useState<CRMConnection[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // Contact Form Modal State
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formType, setFormType] = useState<"Customer" | "Vendor" | "Supplier" | "Partner">("Customer");
  const [formStatus, setFormStatus] = useState<"Active" | "Paused">("Active");
  const [formNotes, setFormNotes] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  // CRM Connection Modal State
  const [showCRMModal, setShowCRMModal] = useState(false);
  const [selectedCRM, setSelectedCRM] = useState<CRMProvider | null>(null);
  const [crmApiKey, setCrmApiKey] = useState("");
  const [crmApiSecret, setCrmApiSecret] = useState("");
  const [crmSubdomain, setCrmSubdomain] = useState("");
  const [crmDisplayName, setCrmDisplayName] = useState("");
  const [crmConnecting, setCrmConnecting] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);

  // Toast / Feedback State
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<"success" | "error">("success");

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setFeedback(msg);
    setFeedbackType(type);
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch CRM Records
      const recordsRes = await fetch("/api/data/customers");
      if (recordsRes.ok) {
        const recordsJson = await recordsRes.json();
        setContacts(recordsJson.data || []);
      }

      // 2. Fetch CRM Providers
      const providersRes = await fetch("/api/integrations/providers");
      if (providersRes.ok) {
        const providersJson = await providersRes.json();
        const crmOnly = providersJson.filter((p: any) => p.category === "crm" || p.category?.toLowerCase() === "crm");
        setProviders(crmOnly);
      }

      // 3. Fetch Existing Connections
      const connectionsRes = await fetch("/api/integrations");
      if (connectionsRes.ok) {
        const connectionsJson = await connectionsRes.json();
        setConnections(connectionsJson || []);
      }
    } catch (err) {
      console.error("Failed to fetch CRM and contacts data:", err);
      showToast("Failed to load customer registry data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Get active CRM Connection for a provider ID
  const getConnectionForProvider = (providerId: string) => {
    return connections.find(c => c.provider === providerId);
  };

  // Trigger OAuth Connection
  const handleOAuthConnect = (providerId: string) => {
    showToast(`Redirecting to authorize ${providerId}...`);
    window.location.href = `/api/oauth/authorize?provider=${providerId}`;
  };

  // Trigger Manual Connection
  const handleManualConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCRM) return;
    if (!crmApiKey.trim()) {
      setCrmError("API Key is required.");
      return;
    }

    setCrmConnecting(true);
    setCrmError(null);

    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedCRM.id,
          apiKey: crmApiKey,
          apiSecret: crmApiSecret || undefined,
          subdomain: crmSubdomain || undefined,
          displayName: crmDisplayName || selectedCRM.name,
        }),
      });

      if (res.ok) {
        showToast(`Connected to ${selectedCRM.name} successfully!`);
        setShowCRMModal(false);
        // Reset states
        setCrmApiKey("");
        setCrmApiSecret("");
        setCrmSubdomain("");
        setCrmDisplayName("");
        await fetchData();
      } else {
        const errJson = await res.json().catch(() => null);
        setCrmError(errJson?.error || "Failed to configure manual integration.");
      }
    } catch (err: any) {
      setCrmError(err.message || "An unexpected integration error occurred.");
    } finally {
      setCrmConnecting(false);
    }
  };

  // Disconnect CRM Connection
  const handleDisconnect = async (connectionId: string, name: string) => {
    if (!confirm(`Are you sure you want to disconnect ${name}?`)) return;

    try {
      const res = await fetch(`/api/integrations/${connectionId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        showToast(`Disconnected ${name}`);
        await fetchData();
      } else {
        showToast("Failed to disconnect CRM", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error disconnecting CRM", "error");
    }
  };

  // Contact CRUD Form Submissions
  const handleOpenAddModal = () => {
    setEditingContact(null);
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormCompany("");
    setFormType("Customer");
    setFormStatus("Active");
    setFormNotes("");
    setShowFormModal(true);
  };

  const handleOpenEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setFormName(contact.name || "");
    setFormEmail(contact.email || "");
    setFormPhone(contact.phone || "");
    setFormCompany(contact.company || "");
    setFormType(contact.type || "Customer");
    setFormStatus(contact.status || "Active");
    setFormNotes(contact.notes || "");
    setShowFormModal(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      showToast("Name and Email are required fields.", "error");
      return;
    }

    setFormSaving(true);
    try {
      const body: any = {
        name: formName,
        email: formEmail,
        phone: formPhone,
        company: formCompany,
        type: formType,
        status: formStatus,
        notes: formNotes,
      };

      if (editingContact) {
        body._id = editingContact._id;
      }

      const res = await fetch("/api/data/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        showToast(editingContact ? "Contact updated successfully!" : "Contact created successfully!");
        setShowFormModal(false);
        await fetchData();
      } else {
        const errJson = await res.json().catch(() => null);
        showToast(errJson?.error || "Failed to save contact.", "error");
      }
    } catch (err: any) {
      showToast(err.message || "An unexpected error occurred saving contact.", "error");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteContact = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove contact ${name}?`)) return;

    try {
      const res = await fetch(`/api/data/customers/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        showToast(`Removed contact ${name}`);
        await fetchData();
      } else {
        showToast("Failed to remove contact.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error removing contact.", "error");
    }
  };

  const getCRMProviderEmoji = (providerId: string): string => {
    const lower = providerId.toLowerCase();
    if (lower.includes("salesforce")) return "☁️";
    if (lower.includes("hubspot")) return "🧡";
    if (lower.includes("zoho")) return "🦊";
    if (lower.includes("pipedrive")) return "📈";
    if (lower.includes("dynamics")) return "💼";
    return "💼";
  };

  // Filter contacts locally
  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.notes && c.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesTab = activeTab === "All" || c.type?.toLowerCase() === activeTab.toLowerCase();
    const matchesStatus = statusFilter === "All" || c.status?.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesTab && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-stone-400 font-bold">Loading unified CRM registry...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-white animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 pb-6 border-b border-stone-850">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            👥 Customer & CRM Management
          </h1>
          <p className="text-stone-400 font-medium text-sm mt-1">
            Unified client, vendor, and partner directory with automatic AI-driven relationship insights and cross-CRM pipelines.
          </p>
        </div>
        <Button
          onClick={handleOpenAddModal}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-3 px-6 rounded-2xl shadow-lg shadow-emerald-950/20 flex items-center justify-center gap-2 self-start md:self-auto"
        >
          👤 Add Contact Record
        </Button>
      </div>

      {/* CRM Connections Ribbon (Active Top Bar) */}
      <Card className="bg-stone-900/40 border border-stone-850 p-6 rounded-2xl space-y-4">
        <div>
          <h3 className="text-sm font-black flex items-center gap-2">
            🔌 Integrated CRM Pipeline Hub
          </h3>
          <p className="text-stone-400 text-xs mt-1">
            Connect to industry standard CRMs to sync operations data instantly. Configured credentials will auto-populate across modules.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {providers.map((p) => {
            const activeConn = getConnectionForProvider(p.id);
            return (
              <Card
                key={p.id}
                className={`bg-stone-900/60 border p-4 rounded-xl flex items-center justify-between gap-3 ${
                  activeConn ? "border-emerald-600/30" : "border-stone-850"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-stone-800 rounded-lg flex items-center justify-center font-black text-lg border border-stone-700">
                    {getCRMProviderEmoji(p.id)}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-white">{p.name}</h4>
                    {activeConn ? (
                      <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1">
                        <span className="w-1 h-1 bg-emerald-400 rounded-full"></span> Connected
                      </span>
                    ) : (
                      <span className="text-[10px] text-stone-500 font-mono font-bold">Unconfigured</span>
                    )}
                  </div>
                </div>

                {activeConn ? (
                  <button
                    onClick={() => handleDisconnect(activeConn.id, p.name)}
                    className="text-[10px] font-bold text-rose-400 hover:text-rose-300 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedCRM(p);
                      setCrmDisplayName(p.name);
                      setShowCRMModal(true);
                    }}
                    className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Connect
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      </Card>

      {/* Main Filter and Contacts Row */}
      <Card className="bg-stone-900/40 border border-stone-850 p-6 rounded-2xl space-y-6">
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
          {/* Search bar */}
          <div className="w-full lg:w-96">
            <Input
              type="text"
              placeholder="Search contacts, notes, company name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-stone-950 border-stone-800 text-white rounded-xl placeholder-stone-600 focus:border-emerald-600 text-sm py-2 px-4 w-full"
            />
          </div>

          {/* Filters and Dropdown */}
          <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto items-stretch sm:items-center">
            {/* Status Selector */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-stone-950 border border-stone-800 text-stone-300 rounded-xl px-4 py-2 text-xs font-bold focus:border-emerald-600 outline-none h-10"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
            </select>

            {/* Type tabs inside filter container */}
            <div className="flex bg-stone-950 border border-stone-800 p-1.5 rounded-xl gap-1 overflow-x-auto">
              {["All", "Customer", "Vendor", "Supplier", "Partner"].map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                      isActive ? "bg-stone-800 text-white" : "text-stone-400 hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Contacts Table / Grid */}
        <div className="overflow-x-auto rounded-xl border border-stone-850 bg-stone-950/20">
          {filteredContacts.length === 0 ? (
            <div className="text-center py-16 space-y-4">
              <span className="text-4xl block">👥</span>
              <h3 className="text-sm font-extrabold text-stone-400">Registry is empty</h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
                Connect your CRM provider above or manually insert customer records to start configuring automatic operational audits.
              </p>
              <Button
                onClick={handleOpenAddModal}
                className="bg-stone-900 border border-stone-800 hover:bg-stone-800 text-stone-300 font-bold text-xs py-2 px-4 rounded-xl"
              >
                👤 Add Your First Contact
              </Button>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-900/60 border-b border-stone-850 font-mono text-[9px] text-stone-500 uppercase tracking-wider">
                  <th className="p-4 font-bold">Contact Name & Company</th>
                  <th className="p-4 font-bold">Category</th>
                  <th className="p-4 font-bold">Contact Details</th>
                  <th className="p-4 font-bold">Operational Insights</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900/50 text-xs font-semibold text-stone-300">
                {filteredContacts.map((c) => (
                  <tr key={c._id} className="hover:bg-stone-900/20 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-stone-800 text-emerald-400 rounded-lg flex items-center justify-center font-black text-xs border border-stone-700 flex-shrink-0">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <span className="font-extrabold text-white block leading-tight">{c.name}</span>
                          <span className="text-[10px] text-stone-500 block mt-0.5">{c.company || "Independent"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1.5 items-start">
                        <Badge className="bg-stone-950 text-stone-400 border border-stone-850 px-2 py-0.5 text-[9px] uppercase font-black">
                          {c.type || "Customer"}
                        </Badge>
                        <Badge className={`px-2 py-0.5 text-[8px] uppercase font-black border ${
                          c.status === "Active"
                            ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-400"
                            : "bg-amber-950/20 border-amber-900/40 text-amber-400"
                        }`}>
                          {c.status || "Active"}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="space-y-1">
                        <span className="text-stone-300 block font-mono text-[10px]">{c.email}</span>
                        {c.phone && (
                          <span className="text-stone-500 block font-mono text-[9px]">{c.phone}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 max-w-sm">
                      <div className="space-y-1">
                        {c.aiInsights ? (
                          <span className="text-emerald-400/90 italic block leading-relaxed text-[11px]">
                            "🤖 {c.aiInsights}"
                          </span>
                        ) : (
                          <span className="text-stone-500 italic block leading-relaxed text-[11px]">
                            "No AI insights compiled yet. Sync connections to run automated operations auditing on this account."
                          </span>
                        )}
                        {c.notes && (
                          <span className="text-stone-400 block text-[10px] leading-relaxed truncate max-w-xs" title={c.notes}>
                            📝 Notes: {c.notes}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleOpenEditModal(c)}
                          className="text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteContact(c._id, c.name)}
                          className="text-xs font-bold text-stone-500 hover:text-rose-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* ─── MODAL 1: CONTACT FORM MODAL ─── */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowFormModal(false)}>
          <div className="bg-stone-950 border border-stone-900 rounded-3xl p-8 w-full max-w-lg mx-4 shadow-2xl space-y-6 text-white" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-black text-white">
                  {editingContact ? "📝 Edit Contact Record" : "👤 Create New Contact"}
                </h2>
                <p className="text-stone-400 text-xs mt-1">
                  Manage directory records for automated auditing pipelines
                </p>
              </div>
              <button onClick={() => setShowFormModal(false)} className="text-stone-500 hover:text-white text-xl">&times;</button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Full Name *</label>
                  <Input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="Enter full name"
                    className="bg-stone-900 border-stone-800 text-white rounded-xl placeholder-stone-700 text-xs py-2 px-3 w-full font-semibold"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Email Address *</label>
                  <Input
                    type="email"
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    placeholder="e.g. client@company.com"
                    className="bg-stone-900 border-stone-800 text-white rounded-xl placeholder-stone-700 text-xs py-2 px-3 w-full font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Phone Number</label>
                  <Input
                    type="text"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="bg-stone-900 border-stone-800 text-white rounded-xl placeholder-stone-700 text-xs py-2 px-3 w-full font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Company Name</label>
                  <Input
                    type="text"
                    value={formCompany}
                    onChange={e => setFormCompany(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="bg-stone-900 border-stone-800 text-white rounded-xl placeholder-stone-700 text-xs py-2 px-3 w-full font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Category Type</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as any)}
                    className="w-full bg-stone-900 border border-stone-800 text-white rounded-xl px-3 py-2.5 text-xs font-bold outline-none"
                  >
                    <option value="Customer">Customer</option>
                    <option value="Vendor">Vendor</option>
                    <option value="Supplier">Supplier</option>
                    <option value="Partner">Partner</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Operation Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    className="w-full bg-stone-900 border border-stone-800 text-white rounded-xl px-3 py-2.5 text-xs font-bold outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Paused">Paused</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Administrative Notes</label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Insert any relevant contact context, contract terms, or special operations pipeline instructions..."
                  className="w-full h-24 bg-stone-900 border border-stone-800 text-white rounded-xl px-4 py-3 text-xs placeholder-stone-700 focus:border-emerald-600 outline-none leading-relaxed font-medium"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={formSaving}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all disabled:opacity-50"
                >
                  {formSaving ? "Saving..." : "Save Record"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: CRM CONNECTION MODAL ─── */}
      {showCRMModal && selectedCRM && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowCRMModal(false)}>
          <div className="bg-stone-950 border border-stone-900 rounded-3xl p-8 w-full max-w-lg mx-4 shadow-2xl space-y-6 text-white" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  🔌 Connect {selectedCRM.name}
                </h2>
                <p className="text-stone-400 text-xs mt-1">
                  Authorize connection using secure OAuth protocol or custom API Keys
                </p>
              </div>
              <button onClick={() => setShowCRMModal(false)} className="text-stone-500 hover:text-white text-xl">&times;</button>
            </div>

            {crmError && (
              <div className="bg-rose-950/20 border border-rose-800/30 text-rose-400 p-3 rounded-xl text-xs font-bold">
                ⚠️ {crmError}
              </div>
            )}

            {/* Connection Options */}
            <div className="space-y-6">
              {/* Option A: OAuth Authorization */}
              {selectedCRM.authType?.toLowerCase().includes("oauth") && (
                <div className="space-y-3 bg-stone-900/40 border border-stone-850 p-4 rounded-xl">
                  <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider block">Option A: Recommended</span>
                  <h4 className="font-bold text-xs text-white">OAuth Secure Authorize</h4>
                  <p className="text-[11px] text-stone-400 leading-normal">
                    Authenticate directly through {selectedCRM.name}'s secure authorization protocol. No secret keys required.
                  </p>
                  <Button
                    onClick={() => handleOAuthConnect(selectedCRM.id)}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-2.5 rounded-xl shadow-lg shadow-emerald-950/20"
                  >
                    🔐 Authenticate via OAuth 2.0
                  </Button>
                </div>
              )}

              {/* Option B: Manual API Key Form */}
              <form onSubmit={handleManualConnect} className="space-y-4">
                <div className="border-t border-stone-900 pt-4">
                  <span className="text-[10px] font-black uppercase text-stone-500 tracking-wider block mb-4">
                    {selectedCRM.authType?.toLowerCase().includes("oauth") ? "Option B: Configure Custom Keys" : "Configure Custom API Keys"}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Custom Display Name</label>
                    <Input
                      type="text"
                      value={crmDisplayName}
                      onChange={e => setCrmDisplayName(e.target.value)}
                      placeholder={`e.g. My ${selectedCRM.name}`}
                      className="bg-stone-900 border-stone-800 text-white rounded-xl placeholder-stone-700 text-xs py-2 px-3 w-full font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">API Key *</label>
                    <Input
                      type="text"
                      value={crmApiKey}
                      onChange={e => setCrmApiKey(e.target.value)}
                      placeholder="Paste your client API Key"
                      className="bg-stone-900 border-stone-800 text-white rounded-xl placeholder-stone-700 text-xs py-2 px-3 w-full font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Client Secret (optional)</label>
                    <Input
                      type="password"
                      value={crmApiSecret}
                      onChange={e => setCrmApiSecret(e.target.value)}
                      placeholder="Paste your API Client Secret"
                      className="bg-stone-900 border-stone-800 text-white rounded-xl placeholder-stone-700 text-xs py-2 px-3 w-full font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-stone-500 tracking-wider block">Subdomain (optional)</label>
                    <Input
                      type="text"
                      value={crmSubdomain}
                      onChange={e => setCrmSubdomain(e.target.value)}
                      placeholder="e.g. company.salesforce.com"
                      className="bg-stone-900 border-stone-800 text-white rounded-xl placeholder-stone-700 text-xs py-2 px-3 w-full font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    onClick={() => setShowCRMModal(false)}
                    className="bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={crmConnecting}
                    className="bg-stone-100 hover:bg-white text-black px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all disabled:opacity-50"
                  >
                    {crmConnecting ? "Connecting..." : "Connect Custom Key"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ─── Toast Toast/Feedback Toast ─── */}
      {feedback && (
        <div className={`fixed bottom-6 right-6 border text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none ${
          feedbackType === "success" ? "bg-stone-900 border-emerald-500" : "bg-stone-900 border-rose-500"
        }`}>
          <span className={feedbackType === "success" ? "text-emerald-500" : "text-rose-500"}>
            {feedbackType === "success" ? "✓" : "⚠️"}
          </span>
          <span className="text-xs font-bold font-mono uppercase tracking-wider">{feedback}</span>
        </div>
      )}
    </div>
  );
}
