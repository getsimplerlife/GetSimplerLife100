import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/employees/")({
  component: EmployeesManager,
});

function EmployeesManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const fetchEmployees = async () => {
    try {
      const res = await fetch("/api/data/employees", { credentials: "include" });
      const d = await res.json();
      
      if (d.data && d.data.length > 0) {
        setEmployees(d.data);
        setLoading(false);
      } else {
        // Self-healing: auto-seed default AI employees if database section is empty
        setSeeding(true);
        const defaultEmployees = [
          {
            id: "sales-ai",
            name: "Sarah Jenkins (Sales AI Coordinator)",
            owner: "John",
            dept: "Sales",
            purpose: "Triages incoming inbound RFPs, evaluates budget and timeline, and qualifies high-value leads.",
            status: "Active",
            version: "v1.4.2",
            currentTask: "Analyzing incoming inbound RFP emails for qualified budget & timelines",
            successRate: 99.2,
            performance: 99,
            avgTime: "1.2s",
            manager: "John (Owner)",
            tasksCompleted: 1420,
            hoursSaved: 118.3,
            confidence: 99.2,
            knowledge: ["Carrier RFP SOPs", "Inbound Sales Playbook v3", "Lead Qualification Matrix"],
            connectedApps: ["Outlook", "HubSpot", "Slack"],
            recentDecisions: [
              { id: "DEC-824", timestamp: "09:14 AM", action: "Qualified Inbound Lead", details: "RFP from Acme Corp ($45k budget) routed to HubSpot", status: "Success" },
              { id: "DEC-819", timestamp: "08:45 AM", action: "Disqualified Spam Email", details: "SEO offering from 'LinkBuilders' marked as spam", status: "Ignored" }
            ]
          },
          {
            id: "crm-ai",
            name: "Charlie CRM (Enrichment Agent)",
            owner: "John",
            dept: "Sales",
            purpose: "Monitors qualified leads, enriches corporate profiles with LinkedIn/Clearbit, and updates CRM values.",
            status: "Active",
            version: "v1.1.0",
            currentTask: "Enriching Acme Corp CRM profile with LinkedIn corporate telemetry",
            successRate: 98.4,
            performance: 98,
            avgTime: "0.9s",
            manager: "Sarah Jenkins (Sales AI Coordinator)",
            tasksCompleted: 940,
            hoursSaved: 78.5,
            confidence: 98.4,
            knowledge: ["Enrichment Data Guidelines", "HubSpot Custom Properties Mapping", "GDPR Compliance Rules"],
            connectedApps: ["HubSpot", "LinkedIn Navigator API", "Clearbit"],
            recentDecisions: [
              { id: "DEC-731", timestamp: "09:16 AM", action: "Enriched Profile", details: "Acme Corp details (450 employees, Tech sector) updated in HubSpot", status: "Success" }
            ]
          },
          {
            id: "quote-ai",
            name: "Quentin Quote (Quotation Engine)",
            owner: "John",
            dept: "Operations",
            purpose: "Calculates global pricing, generates standard discount matrixes, and formats contract quotes.",
            status: "Idle",
            version: "v1.0.2",
            currentTask: "Idle - Awaiting new qualified sales pipeline entry",
            successRate: 97.8,
            performance: 97,
            avgTime: "2.1s",
            manager: "Charlie CRM (Enrichment Agent)",
            tasksCompleted: 612,
            hoursSaved: 51.0,
            confidence: 97.8,
            knowledge: ["Global Pricing Matrix 2026", "Discounts Authorization Limits", "Contract Terms Template"],
            connectedApps: ["SAP ERP", "Google Sheets (Pricing Model)", "Docusign"],
            recentDecisions: [
              { id: "DEC-512", timestamp: "Yesterday", action: "Drafted Sales Quote", details: "Quote #Q-2026-4412 for Acme Corp generated with standard 10% volume discount", status: "Pending Approval" }
            ]
          },
          {
            id: "invoice-ai",
            name: "Ivy Invoice (Billing Coordinator)",
            owner: "John",
            dept: "Finance",
            purpose: "Automates Stripe invoice creation, executes QuickBooks reconciliation, and handles sales receipts.",
            status: "Active",
            version: "v2.1.0",
            currentTask: "Matching payment receipt from Stripe Webhook for Invoice #I-9421",
            successRate: 99.5,
            performance: 100,
            avgTime: "1.5s",
            manager: "Quentin Quote (Quotation Engine)",
            tasksCompleted: 1840,
            hoursSaved: 153.3,
            confidence: 99.5,
            knowledge: ["GAAP Revenue Recognition Standard", "Stripe Fee Accounting Rules", "Tax Compliance SOP"],
            connectedApps: ["Stripe", "QuickBooks", "Xero"],
            recentDecisions: [
              { id: "DEC-942", timestamp: "09:17 AM", action: "Matched Payment", details: "Matched Stripe payment $45,000 to Invoice #I-9421, reconciled in QuickBooks", status: "Success" }
            ]
          },
          {
            id: "collections-ai",
            name: "Caleb Collections (Dunning Agent)",
            owner: "John",
            dept: "Finance",
            purpose: "Politely resolves overdue invoices through custom dunning email sequences and tone preferences.",
            status: "Active",
            version: "v1.0.0",
            currentTask: "Drafting follow-up reminder for outstanding invoice #I-9102",
            successRate: 96.2,
            performance: 96,
            avgTime: "3.4s",
            manager: "Ivy Invoice (Billing Coordinator)",
            tasksCompleted: 480,
            hoursSaved: 40.0,
            confidence: 96.2,
            knowledge: ["Dunning Frequency SOP", "Customer Tone Preference Matrix", "Late Fee Policies"],
            connectedApps: ["Outlook", "HubSpot CRM", "Stripe Billing"],
            recentDecisions: [
              { id: "DEC-312", timestamp: "08:12 AM", action: "Sent Dunning Email", details: "Friendly reminder sent to GlobalCorp for 3-day overdue Invoice #I-9102", status: "Success" }
            ]
          }
        ];

        for (const emp of defaultEmployees) {
          await fetch("/api/data/employees", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(emp),
          });
        }
        setEmployees(defaultEmployees);
        setSeeding(false);
        setLoading(false);
      }
    } catch (err) {
      console.error("Error loading employees:", err);
      setLoading(false);
      setSeeding(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleAction = async (empName: string, actionName: string) => {
    try {
      setFeedback(`Processing action "${actionName}" for ${empName}...`);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "employee_" + actionName.toLowerCase().replace(" ", "_"),
          resource: empName,
          details: { name: empName, action: actionName },
        }),
      });
      await res.json();
      
      // Update local state to immediately show change
      const updated = employees.map(emp => {
        if (emp.name === empName) {
          if (actionName === "Pause") {
            return { ...emp, status: "Paused" };
          } else if (actionName === "Resume") {
            return { ...emp, status: "Active" };
          }
        }
        return emp;
      });
      setEmployees(updated);

      setFeedback(`Success: ${actionName} processed for ${empName}`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
      setFeedback(`Error: Failed to process ${actionName} for ${empName}`);
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.purpose.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.dept.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || emp.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  // Help find a local employee database entry safely
  const getEmpId = (emp: any) => emp.id || emp._id;

  if (loading || seeding) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
        <p className="text-xs font-mono text-stone-500">
          {seeding ? "Reconciling autonomous coworker registry..." : "Loading active workforce context..."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10 text-stone-100 max-w-6xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">AI WORKFORCE SYSTEM ACTIVE</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight leading-none">🤖 AI Employee Directory</h1>
        <p className="text-stone-400 text-sm max-w-2xl leading-relaxed">
          Monitor operational statuses, review embedded knowledge bases, and configure trigger-execution policies for your specialized coworkers.
        </p>
      </div>

      {/* ─── AI WORKFORCE HIERARCHY MAP ─── */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-mono tracking-widest text-stone-500 uppercase">⚡ PIPELINE WORKFORCE MAP</h2>
          <p className="text-xs text-stone-600">Click any employee node below to review full cognitive profiles, knowledge bases, and decision histories.</p>
        </div>

        <div className="bg-stone-950 border border-stone-900 rounded-xl p-6 overflow-x-auto select-none relative">
          
          {/* Main SVG connecting line */}
          <div className="min-w-[900px] flex items-center justify-between py-6 relative">
            
            {/* SVG Connecting Dotted Lines with pulse effect */}
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 z-0 overflow-hidden">
              <svg className="w-full h-2" fill="none">
                <line 
                  x1="0" y1="4" x2="100%" y2="4" 
                  stroke="#292524" strokeWidth="2" strokeDasharray="6 6"
                />
                <line 
                  x1="0" y1="4" x2="100%" y2="4" 
                  stroke="#10b981" strokeWidth="2" strokeDasharray="6 40"
                  className="animate-pulse"
                />
              </svg>
            </div>

            {/* Sales Intake Trigger Node */}
            <div className="flex flex-col items-center space-y-2.5 z-10 w-40 shrink-0">
              <div className="h-10 w-10 rounded-full bg-stone-900 border-2 border-stone-800 flex items-center justify-center text-xs font-mono font-bold text-stone-500 shadow-lg">
                📥
              </div>
              <div className="text-center space-y-0.5">
                <p className="text-[10px] font-mono font-bold text-stone-400">SALES INTAKE</p>
                <p className="text-[9px] text-stone-600 font-medium">Inbound Emails / RFPs</p>
              </div>
            </div>

            {/* Node 1: Sales AI */}
            {employees.find(e => e.id === "sales-ai") && (
              <Link 
                to={`/portal/employees/sales-ai`}
                className="flex flex-col items-center space-y-2.5 z-10 w-40 shrink-0 group transition-all"
              >
                <div className="h-12 w-12 rounded-xl bg-stone-950 border-2 border-emerald-900 group-hover:border-emerald-500 flex items-center justify-center relative shadow-xl transition-all duration-300">
                  <span className="text-lg">🤖</span>
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse border border-stone-950" />
                </div>
                <div className="text-center space-y-0.5">
                  <p className="text-[11px] font-bold text-stone-200 group-hover:text-emerald-400 transition-colors">Sarah Jenkins</p>
                  <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest">Sales Coordinator</p>
                </div>
              </Link>
            )}

            {/* Node 2: CRM AI */}
            {employees.find(e => e.id === "crm-ai") && (
              <Link 
                to={`/portal/employees/crm-ai`}
                className="flex flex-col items-center space-y-2.5 z-10 w-40 shrink-0 group transition-all"
              >
                <div className="h-12 w-12 rounded-xl bg-stone-950 border-2 border-emerald-900 group-hover:border-emerald-500 flex items-center justify-center relative shadow-xl transition-all duration-300">
                  <span className="text-lg">🤖</span>
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse border border-stone-950" />
                </div>
                <div className="text-center space-y-0.5">
                  <p className="text-[11px] font-bold text-stone-200 group-hover:text-emerald-400 transition-colors">Charlie CRM</p>
                  <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest">Enrichment Agent</p>
                </div>
              </Link>
            )}

            {/* Node 3: Quote AI */}
            {employees.find(e => e.id === "quote-ai") && (
              <Link 
                to={`/portal/employees/quote-ai`}
                className="flex flex-col items-center space-y-2.5 z-10 w-40 shrink-0 group transition-all"
              >
                <div className="h-12 w-12 rounded-xl bg-stone-950 border-2 border-stone-800 group-hover:border-stone-500 flex items-center justify-center relative shadow-xl transition-all duration-300">
                  <span className="text-lg">🤖</span>
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-stone-500 border border-stone-950" />
                </div>
                <div className="text-center space-y-0.5">
                  <p className="text-[11px] font-bold text-stone-300 group-hover:text-stone-100 transition-colors">Quentin Quote</p>
                  <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest">Pricing Engine</p>
                </div>
              </Link>
            )}

            {/* Node 4: Invoice AI */}
            {employees.find(e => e.id === "invoice-ai") && (
              <Link 
                to={`/portal/employees/invoice-ai`}
                className="flex flex-col items-center space-y-2.5 z-10 w-40 shrink-0 group transition-all"
              >
                <div className="h-12 w-12 rounded-xl bg-stone-950 border-2 border-emerald-900 group-hover:border-emerald-500 flex items-center justify-center relative shadow-xl transition-all duration-300">
                  <span className="text-lg">🤖</span>
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse border border-stone-950" />
                </div>
                <div className="text-center space-y-0.5">
                  <p className="text-[11px] font-bold text-stone-200 group-hover:text-emerald-400 transition-colors">Ivy Invoice</p>
                  <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest">Billing Officer</p>
                </div>
              </Link>
            )}

            {/* Node 5: Collections AI */}
            {employees.find(e => e.id === "collections-ai") && (
              <Link 
                to={`/portal/employees/collections-ai`}
                className="flex flex-col items-center space-y-2.5 z-10 w-40 shrink-0 group transition-all"
              >
                <div className="h-12 w-12 rounded-xl bg-stone-950 border-2 border-emerald-900 group-hover:border-emerald-500 flex items-center justify-center relative shadow-xl transition-all duration-300">
                  <span className="text-lg">🤖</span>
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse border border-stone-950" />
                </div>
                <div className="text-center space-y-0.5">
                  <p className="text-[11px] font-bold text-stone-200 group-hover:text-emerald-400 transition-colors">Caleb Collections</p>
                  <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest">Dunning Agent</p>
                </div>
              </Link>
            )}

            {/* ERP/Accounting Output Node */}
            <div className="flex flex-col items-center space-y-2.5 z-10 w-40 shrink-0">
              <div className="h-10 w-10 rounded-full bg-stone-900 border-2 border-stone-800 flex items-center justify-center text-xs font-mono font-bold text-stone-500 shadow-lg">
                🏛️
              </div>
              <div className="text-center space-y-0.5">
                <p className="text-[10px] font-mono font-bold text-stone-400">LEDGER SYNC</p>
                <p className="text-[9px] text-stone-600 font-medium">QuickBooks / SAP</p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-stone-950 p-4 rounded-xl border border-stone-900">
        <input
          type="text"
          placeholder="Search AI coworkers by name, department, or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-stone-900/40 border border-stone-900 rounded-lg px-4 py-2.5 text-xs outline-none focus:border-stone-800 font-medium placeholder-stone-600 text-stone-200"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-stone-900/40 border border-stone-900 rounded-lg px-4 py-2.5 text-xs outline-none focus:border-stone-800 font-bold text-stone-400"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="idle">Idle</option>
          <option value="paused">Paused</option>
        </select>
      </div>

      {/* Main Table Container */}
      <div className="bg-stone-950 border border-stone-900 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-medium">
            <thead>
              <tr className="border-b border-stone-900 text-stone-500 uppercase font-mono tracking-wider text-[10px]">
                <th className="p-4 pl-6">COWORKER IDENTIFICATION</th>
                <th className="p-4">DEPARTMENT & PURPOSE</th>
                <th className="p-4">STATUS & BUILD</th>
                <th className="p-4">CURRENT OPERATING TASK</th>
                <th className="p-4">ACCURACY PROFILE</th>
                <th className="p-4 text-right pr-6">CONTROL ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-900">
              {filteredEmployees.map((emp, idx) => (
                <tr key={idx} className="hover:bg-stone-900/10 transition-colors">
                  {/* Name & Owner */}
                  <td className="p-4 pl-6">
                    <Link to={`/portal/employees/${getEmpId(emp)}`} className="font-bold text-white hover:text-blue-400 block transition-colors">
                      {emp.name.split(" (")[0]}
                    </Link>
                    <span className="text-[10px] text-stone-500 font-mono">Owner ID: {emp.owner}</span>
                  </td>
                  {/* Purpose & Dept */}
                  <td className="p-4 max-w-xs leading-normal font-normal">
                    <span className="text-[9px] font-mono font-bold uppercase bg-stone-900 text-stone-400 px-1.5 py-0.5 rounded border border-stone-850 block w-max mb-1.5">
                      {emp.dept}
                    </span>
                    <div className="text-stone-400 font-medium line-clamp-2">{emp.purpose}</div>
                  </td>
                  {/* Status & Version */}
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider font-bold mb-1.5 ${
                      emp.status === "Active" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900" :
                      emp.status === "Idle" ? "bg-stone-900 text-stone-400 border border-stone-850" :
                      "bg-stone-900/40 text-stone-500 border border-stone-900"
                    }`}>
                      <span className={`h-1 w-1 rounded-full ${emp.status === "Active" ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
                      {emp.status}
                    </span>
                    <div className="text-[10px] text-stone-500 font-mono block">Ver: {emp.version}</div>
                  </td>
                  {/* Current Task */}
                  <td className="p-4 text-stone-400 font-medium max-w-xs truncate">{emp.currentTask}</td>
                  {/* Performance */}
                  <td className="p-4">
                    <div className="space-y-1.5 w-32">
                      <div className="w-full bg-stone-900 rounded-full h-1 overflow-hidden">
                        <div className="bg-emerald-500 h-full" style={{ width: `${emp.successRate}%` }} />
                      </div>
                      <div className="text-[10px] text-stone-500 font-mono">
                        Acc: {emp.performance}% • {emp.avgTime || "1s"}
                      </div>
                    </div>
                  </td>
                  {/* Actions */}
                  <td className="p-4 text-right pr-6">
                    <div className="flex justify-end gap-1.5 font-mono text-[10px]">
                      <button
                        onClick={() => handleAction(emp.name, emp.status === "Active" ? "Pause" : "Resume")}
                        className="bg-stone-900 hover:bg-stone-850 text-white font-bold px-2.5 py-1.5 rounded-lg border border-stone-800 transition-all"
                      >
                        {emp.status === "Active" ? "Pause" : "Resume"}
                      </button>
                      <Link
                        to={`/portal/employees/${getEmpId(emp)}`}
                        className="bg-white hover:bg-stone-100 text-black font-bold px-2.5 py-1.5 rounded-lg transition-all"
                      >
                        Profile
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-stone-500 font-mono text-xs">
                    No autonomous coworkers match the filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-850 text-white px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-slideUp font-mono text-xs">
          <span className="text-blue-500">✓</span>
          <span className="font-bold">{feedback}</span>
        </div>
      )}
    </div>
  );
}
