import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/customers/")({
  component: CustomerManagement,
});

function CustomerManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data/customers", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setContacts(d.data || []);
      setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleAction = async (name: string, action: string) => {
    try {
      setFeedback(`Processing CRM action: ${action}...`);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "crm_" + action.toLowerCase().replace(" ", "_"), resource: name }),
      });
      await res.json();
      setFeedback(`Success: ${action} processed for ${name}`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const tabs = [
    { key: "all", name: "All CRM Records" },
    { key: "customer", name: "Customers" },
    { key: "vendor", name: "Vendors" },
    { key: "supplier", name: "Suppliers" },
  ];

  const filteredContacts = contacts.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || c.type.toLowerCase() === activeTab.toLowerCase();
    const matchesStatus = statusFilter === "all" || c.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesTab && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-stone-200 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">👥 Customer & CRM Management</h1>
          <p className="text-stone-500 mt-1">Unified client, vendor, and partner directory with automatic AI-driven relationship insights.</p>
        </div>
        <button
          onClick={() => handleAction("New Contact", "add_contact")}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-lg flex items-center justify-center gap-2"
        >
          👤 Add CRM Record
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stone-200 overflow-x-auto select-none gap-2 pb-px scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
              activeTab === tab.key ? "border-emerald-600 text-emerald-600" : "border-transparent text-stone-500 hover:text-stone-900"
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none font-bold"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 py-16 bg-white border border-stone-200 rounded-3xl max-w-xl mx-auto my-8">
          <div className="text-4xl mb-4">👥</div>
          <h3 className="text-lg font-extrabold text-stone-950 mb-2">No CRM records yet</h3>
          <p className="text-sm text-stone-500 mb-6 max-w-sm leading-relaxed">
            Your clients, vendors, and partners directory with automated relationship insights will populate here automatically.
          </p>
          <button
            onClick={() => handleAction("New Contact", "add_contact")}
            className="inline-flex items-center justify-center bg-stone-950 hover:bg-stone-900 text-white font-extrabold px-6 py-3 rounded-2xl transition-all font-mono text-xs shadow-lg shadow-black/5 active:scale-95"
          >
            👤 Add Your First Contact
          </button>
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 py-12 bg-white border border-stone-200 rounded-3xl max-w-xl mx-auto my-8">
          <div className="text-2xl mb-2">🔍</div>
          <h4 className="text-sm font-bold text-stone-900 mb-1">No matching contacts</h4>
          <p className="text-xs text-stone-500 max-w-xs">
            We couldn't find any CRM records matching your search or filters. Try adjusting them.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-stone-50 text-stone-500 border-b border-stone-150 uppercase tracking-wider">
                <th className="p-4 font-bold">Contact Name</th>
                <th className="p-4 font-bold">Type</th>
                <th className="p-4 font-bold">Email</th>
                <th className="p-4 font-bold">AI Insights</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-semibold text-stone-700">
              {filteredContacts.map((c, i) => (
                <tr key={i} className="hover:bg-stone-50/40">
                  <td className="p-4 font-black text-stone-900">{c.name}</td>
                  <td className="p-4">{c.type}</td>
                  <td className="p-4">{c.email}</td>
                  <td className="p-4 italic text-stone-500">"{c.aiInsights}"</td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleAction(c.name, "edit")} className="text-emerald-600 hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}