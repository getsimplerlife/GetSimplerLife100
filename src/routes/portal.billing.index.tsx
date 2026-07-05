import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/billing/")({
  component: PlanAndBilling,
});

function PlanAndBilling() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/data/billing", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setInvoices(d.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDownload = async (id: string) => {
    try {
      setFeedback(`Initiating download for invoice ${id}...`);
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "invoice_download", resource: id }),
      });
      setFeedback("Success: Invoice download ready");
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-12 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-stone-900 dark:text-white tracking-tight flex items-center gap-2">💳 Plan & Billing</h1>
        <p className="text-stone-500 dark:text-stone-400 mt-1">Review active subscriptions, analyze real-time resource usage, and download financial invoices.</p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Plan */}
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-6 hover:border-emerald-500/20 transition-all">
          <div className="space-y-4">
            <span className="text-[10px] font-black uppercase text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800/50 px-3 py-1 rounded-full">Active Plan</span>
            <h3 className="text-2xl font-black text-stone-900 dark:text-white">Starter Build</h3>
            <p className="text-stone-500 dark:text-stone-400 text-xs leading-relaxed font-semibold">Includes 2 active AI employees, 3 operational workflows, 30 days of standard tech support.</p>
          </div>
          <button onClick={handleDownload} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-lg transition-all">💳 Manage via Stripe Portal</button>
        </div>

        {/* Invoice History */}
        <div className="lg:col-span-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 shadow-sm space-y-6">
          <h3 className="text-lg font-black text-stone-900 dark:text-white">Invoice History</h3>
          {invoices.length > 0 ? (
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs font-semibold text-stone-600 dark:text-stone-400">
              {invoices.map((inv, idx) => (
                <div key={idx} className="flex justify-between items-center py-3">
                  <div>
                    <div className="font-bold text-stone-900 dark:text-white">{inv.type}</div>
                    <div className="text-[10px] text-stone-400 dark:text-stone-500">{inv.date} • {inv.id}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-stone-950 dark:text-stone-100">{inv.amount}</span>
                    <button onClick={() => handleDownload(inv.id)} className="text-emerald-600 dark:text-emerald-400 hover:underline">Download</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-stone-400 dark:text-stone-500 text-xs py-8 text-center border-2 border-dashed border-stone-100 dark:border-stone-800 rounded-2xl">
              No recent payment invoices. All systems standard.
            </div>
          )}
        </div>
      </div>

      {/* Upgrades & Extras Section */}
      <div className="space-y-8 pt-6 border-t border-stone-200 dark:border-stone-800">
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-stone-900 dark:text-white tracking-tight">🚀 Scaling & Upgrades</h2>
          <p className="text-stone-500 dark:text-stone-400 text-sm">Deploy larger team implementation scopes, subscribe to recurring operations SLA plans, or purchase add-on modules.</p>
        </div>

        {/* Implementation Packages & Managed Ops Upgrades */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Implementation Upgrades */}
          <div className="bg-stone-50 dark:bg-stone-900/30 border border-stone-200 dark:border-stone-800/80 rounded-[2rem] p-8 space-y-6">
            <h3 className="text-lg font-black text-stone-900 dark:text-white border-b border-stone-200 dark:border-stone-800 pb-3 flex items-center gap-2">
              <span className="text-xl">🏢</span> Scale Your Core Build Packages
            </h3>
            <div className="space-y-4">
              {[
                { name: "Growth Build Package", desc: "5 AI Employees, cross-dept, full system integrations.", price: "$15,000", link: "https://buy.stripe.com/8x25kE5QW7kUdJ44W13Ru02" },
                { name: "Scale Build Package", desc: "Unlimited AI Employees, customized modeling, priority tech support.", price: "$30,000", link: "https://buy.stripe.com/7sY4gAenscFefRccot3Ru03" },
              ].map((item) => (
                <div key={item.name} className="p-4 bg-white dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="font-black text-stone-900 dark:text-white text-sm">{item.name}</div>
                    <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm">{item.desc}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-start sm:items-end gap-2">
                    <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{item.price}</span>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border border-stone-200 dark:border-stone-800 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-[0_0_12px_rgba(59,130,246,0.15)] text-stone-900 dark:text-stone-100 bg-white dark:bg-stone-900/50 transition-all duration-300 font-bold px-3 py-1.5 rounded-lg text-xs"
                    >
                      Upgrade Build
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Managed Operations Subscriptions */}
          <div className="bg-stone-50 dark:bg-stone-900/30 border border-stone-200 dark:border-stone-800/80 rounded-[2rem] p-8 space-y-6">
            <h3 className="text-lg font-black text-stone-900 dark:text-white border-b border-stone-200 dark:border-stone-800 pb-3 flex items-center gap-2">
              <span className="text-xl">⚙️</span> Managed Support & Ops Plans
            </h3>
            <div className="space-y-4">
              {[
                { name: "Essential Operations Support", desc: "Routine health checks, API adjustments, and basic uptime monitoring.", price: "$750/mo", link: "https://buy.stripe.com/28E4gAens20AfRcbkp3Ru04" },
                { name: "Professional Operations Support", desc: "Includes alignment calls, workflow expansion, and new templates.", price: "$2,000/mo", link: "https://buy.stripe.com/cNieVe7Z4ax6fRc0FL3Ru05" },
                { name: "Enterprise Operations Support", desc: "Sub-hour priority SLA support and dedicated engineering resource.", price: "$5,000/mo", link: "https://buy.stripe.com/fZubJ2a7cax67kG9ch3Ru06" },
              ].map((item) => (
                <div key={item.name} className="p-4 bg-white dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="font-black text-stone-900 dark:text-white text-sm">{item.name}</div>
                    <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm">{item.desc}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-start sm:items-end gap-2">
                    <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{item.price}</span>
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border border-stone-200 dark:border-stone-800 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-[0_0_12px_rgba(59,130,246,0.15)] text-stone-900 dark:text-stone-100 bg-white dark:bg-stone-900/50 transition-all duration-300 font-bold px-3 py-1.5 rounded-lg text-xs"
                    >
                      Subscribe
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Coworker Add-On Modules Grid */}
        <div className="space-y-6 pt-4">
          <h3 className="text-xl font-black text-stone-900 dark:text-white border-b border-stone-200 dark:border-stone-800 pb-3 flex items-center gap-2">
            <span className="text-xl">🔌</span> Add-On Employee Functional Modules
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { name: "Additional AI Agent", desc: "Deploy an extra dedicated agent loop tailored for unique operational tasks.", price: "$1,500", link: "https://buy.stripe.com/8x26oIensbBa0Wi4W13Ru07", icon: "🤖" },
              { name: "CRM Integration", desc: "Sync your digital coworkers directly into Salesforce, HubSpot, or Zoho.", price: "$2,000", link: "https://buy.stripe.com/8x2dRaa7cax66gC0FL3Ru08", icon: "🔌" },
              { name: "ERP Integration", desc: "Wire advanced inventory and resource data into SAP, NetSuite, or Oracle.", price: "$3,500", link: "https://buy.stripe.com/aFa9AUa7c7kUawSdsx3Ru09", icon: "🏭" },
              { name: "Voice AI Receptionist", desc: "Deploy high-fidelity, autonomous voice lines handling inbound call reception.", price: "$2,500", link: "https://buy.stripe.com/dRmeVedjo5cM34qewB3Ru0a", icon: "📞" },
              { name: "AI Sales Assistant", desc: "Automatically draft outreach, sync pipelines, and follow up warm leads.", price: "$2,000", link: "https://buy.stripe.com/28EcN61AGax6bAW3RX3Ru0b", icon: "📈" },
              { name: "AI Customer Support Agent", desc: "Provide real-time email, ticket, and chat resolutions under 5 minutes.", price: "$1,800", link: "https://buy.stripe.com/fZu3cw3IO20AeN8ewB3Ru0c", icon: "🤝" },
              { name: "Custom Dashboard", desc: "Gain real-time executive analytics, ROI calculators, and system health status.", price: "$1,500", link: "https://buy.stripe.com/5kQ7sM3IO20AgVgewB3Ru0d", icon: "📊" },
              { name: "Document AI System", desc: "Extract unstructured invoice, fax, or contract data with 100% precision.", price: "$2,500", link: "https://buy.stripe.com/7sY5kEa7cdJi7kG9ch3Ru0e", icon: "📄" },
              { name: "Internal Knowledge Assistant", desc: "Empower your workforce with immediate search across full internal company wiki.", price: "$1,500", link: "https://buy.stripe.com/00w28s3IO8oYbAW9ch3Ru0f", icon: "🧠" },
              { name: "Employee Training", desc: "Custom training workflows mapping company compliance and handbook details.", price: "$1,200", link: "https://buy.stripe.com/3cI00k0wC0Ww8oKbkp3Ru0g", icon: "🏫" },
              { name: "Additional Dept Automation", desc: "Extend automations across other vertical department operational tasks.", price: "$2,500", link: "https://buy.stripe.com/cNi00ka7ceNmdJ49ch3Ru0h", icon: "🏢" }
            ].map((item) => (
              <div key={item.name} className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-6 rounded-2xl flex flex-col justify-between gap-4 hover:border-emerald-500/20 hover:shadow-sm transition-all">
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{item.icon}</span>
                      <h4 className="font-bold text-stone-900 dark:text-white text-sm leading-tight">{item.name}</h4>
                    </div>
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 shrink-0">{item.price}</span>
                  </div>
                  <p className="text-stone-500 dark:text-stone-400 text-xs leading-relaxed">{item.desc}</p>
                </div>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-center border border-stone-200 dark:border-stone-800 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-[0_0_12px_rgba(59,130,246,0.15)] text-stone-900 dark:text-stone-100 bg-white dark:bg-stone-900/50 transition-all duration-300 font-bold py-2 rounded-lg text-xs"
                >
                  Purchase Add-On
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}
    </div>
  );
}
