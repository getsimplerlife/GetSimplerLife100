import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/portal/audit-logs/")({
  component: SystemAuditLogs,
});

function SystemAuditLogs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [logs, setLogs] = useState([
    { id: "AUD-9012", time: "2026-07-04 11:58", user: "AI Intake Specialist", category: "AI Decisions", action: "Extracted Invoice Fields", resource: "invoice_9812.pdf", details: "PII parsed correctly. Confidence rating: 99.4%", ip: "Internal Sandbox API", status: "Success" },
    { id: "AUD-9011", time: "2026-07-04 11:50", user: "John Connor", category: "User Activity", action: "Triggered Manual Hot-Restart", resource: "AI Reconciliation Analyst", details: "Manual process override executed via active console settings.", ip: "192.168.1.12", status: "Success" },
    { id: "AUD-9010", time: "2026-07-04 11:42", user: "AI Reconciliation Analyst", category: "Workflow Runs", action: "Matched Bank Ledger Account", resource: "Stripe Bank Feeds Hub", details: "Matched bank ledger #8401 with invoice general ledger.", ip: "Internal Sandbox API", status: "Success" },
    { id: "AUD-9009", time: "2026-07-04 11:30", user: "AI Prior Auth Auditor", category: "AI Decisions", action: "Prior Auth Validation Hold", resource: "claim_9281.pdf", details: "Confidence boundary triggered manual human review pipeline holds.", ip: "Internal Sandbox API", status: "Warning" },
    { id: "AUD-9008", time: "2026-07-04 11:12", user: "Sarah Connor", category: "Changes", action: "Modified Automation Workflow", resource: "WF-CO-303 Response Draft", details: "Updated Claude 3.5 Sonnet temperature gate settings parameter from 0.7 to 0.4.", ip: "192.168.1.15", status: "Success" },
    { id: "AUD-9007", time: "2026-07-04 10:45", user: "AI Intake Specialist", category: "Workflow Runs", action: "Parse Document Execution Failed", resource: "PO_3910.xlsx", details: "Validation failed: column 'Tax ID Number' is missing or unindexed.", ip: "Internal Sandbox API", status: "Failed" },
    { id: "AUD-9006", time: "2026-07-04 09:30", user: "Miles Dyson", category: "API Calls", action: "Generated API Credentials Token", resource: "API Center Hub", details: "Generated live bearer access key (expires 1 hour).", ip: "192.168.4.112", status: "Success" },
    { id: "AUD-9005", time: "2026-07-04 09:00", user: "System Scheduler", category: "Security Events", action: "Enforced Session Expiration Log", resource: "SSO Login Module", details: "Auto-logged out inactive user PeterGibbons (120m timeout reached).", ip: "Internal Gateway", status: "Success" },
    { id: "AUD-9004", time: "2026-07-03 16:45", user: "Peter Gibbons", category: "Login History", action: "Tenant Session Auth Login", resource: "SSO Gateway Access", details: "Authorized workspace session via corporate Okta single-sign-on.", ip: "192.168.1.55", status: "Success" },
    { id: "AUD-9003", time: "2026-07-03 15:30", user: "Initech HR Desk", category: "Security Events", action: "Flagged Unauthorized Login Exception", resource: "SSO Login Module", details: "Failed single-sign-on challenge: incorrect user signature hash.", ip: "192.168.1.104", status: "Failed" },
    { id: "AUD-9002", time: "2026-07-03 14:15", user: "System Scheduler", category: "Workflow Runs", action: "Triggered Daily Restock Pipeline", resource: "WF-IN-101", details: "Triggered supply chain inventory forecast and reorder checks.", ip: "Internal Gateway", status: "Success" },
    { id: "AUD-9001", time: "2026-07-03 12:00", user: "Gavin Belson", category: "Changes", action: "Updated Tenant Core Brandings", resource: "Workspace Brand Settings", details: "Rebranded target logo URL asset index path in dashboard settings.", ip: "192.168.8.8", status: "Success" },
    { id: "AUD-9000", time: "2026-07-03 11:30", user: "Bob Vance", category: "API Calls", action: "Registered Dropbox Connector Token", resource: "Integrations Center Hub", details: "Authorized mutual Dropbox cloud storage token directory.", ip: "192.168.12.1", status: "Success" },
    { id: "AUD-8999", time: "2026-07-03 10:12", user: "System Scheduler", category: "Security Events", action: "Hourly Health Check Verification", resource: "Heartbeat Sentinel Monitor", details: "Global sandbox cluster check passed (100% active endpoints synced).", ip: "Internal Sentinel", status: "Success" },
    { id: "AUD-8998", time: "2026-07-03 09:00", user: "Michael Bolton", category: "Changes", action: "Modified Role Permissions Settings", resource: "RBAC User Roles Hub", details: "Assigned Operations Manager role permissions to SarahConnor.", ip: "192.168.1.13", status: "Success" },
  ]);

  const categories = [
    { key: "all", name: "All Log Registries" },
    { key: "User Activity", name: "User Actions" },
    { key: "AI Decisions", name: "AI Decisions" },
    { key: "Workflow Runs", name: "Process Runs" },
    { key: "API Calls", name: "API Usage" },
    { key: "Login History", name: "Logins" },
    { key: "Changes", name: "Settings Changes" },
    { key: "Security Events", name: "Security Alerts" },
  ];

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.user.toLowerCase().includes(searchTerm.toLowerCase()) || log.action.toLowerCase().includes(searchTerm.toLowerCase()) || log.details.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || log.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 font-sans">
      {/* Header */}
      <div className="border-b border-stone-200 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">📜 System Audit Logs</h1>
          <p className="text-stone-500 mt-1">Immutable ledger logging user actions, AI decision variables, model predictions, API calls, and tenant security events.</p>
        </div>
        <button
          onClick={() => fetch("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ action: "audit_export_ledger" }) }).then(r=>r.json()).then(d=>console.log(d.message))}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-lg shadow-emerald-600/10 self-start md:self-auto"
        >
          🔒 Export Cryptographic Audit CSV
        </button>
      </div>

      {/* Categories stream filter buttons */}
      <div className="flex border-b border-stone-200 overflow-x-auto select-none gap-2 pb-px scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategoryFilter(cat.key)}
            className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
              categoryFilter === cat.key
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-stone-500 hover:text-stone-900"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <input
          type="text"
          placeholder="Search logs by actor user, action description, or specific metadata details..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
        />
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-semibold">
            <thead>
              <tr className="bg-stone-50 text-stone-500 font-bold border-b border-stone-150 uppercase tracking-wider">
                <th className="p-4">Log ID</th>
                <th className="p-4">Timestamp</th>
                <th className="p-4">Actor Entity</th>
                <th className="p-4">Category & Action</th>
                <th className="p-4">Target Resource</th>
                <th className="p-4">Ledger Context Details</th>
                <th className="p-4">IP Address</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-stone-50/40">
                  <td className="p-4 font-mono font-bold text-stone-400">{log.id}</td>
                  <td className="p-4 text-stone-500">{log.time}</td>
                  <td className="p-4 font-black text-stone-900">{log.user}</td>
                  <td className="p-4">
                    <span className="text-[9px] font-black uppercase text-stone-400 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded mr-2">
                      {log.category}
                    </span>
                    <span className="text-stone-850 font-bold">{log.action}</span>
                  </td>
                  <td className="p-4 text-stone-600 truncate max-w-[120px]">{log.resource}</td>
                  <td className="p-4 text-stone-500 font-semibold truncate max-w-xs">{log.details}</td>
                  <td className="p-4 text-stone-400 font-mono font-bold">{log.ip}</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      log.status === "Success" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                      log.status === "Warning" ? "bg-amber-50 text-amber-700 border border-amber-100" :
                      "bg-rose-50 text-rose-700 border border-rose-100"
                    }`}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
