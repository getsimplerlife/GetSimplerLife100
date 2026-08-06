import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
export const Route = createFileRoute("/portal/billing/")({
  component: BillingPage,
});

function BillingPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data/billing", { credentials: "include" })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => { setInvoices(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">💳 Billing & Subscriptions</h1>
        <p className="text-stone-400 text-sm mt-1">Manage your plan, payment method, and view invoices.</p>
      </div>

      {/* Subscription info */}
      <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-black text-white">Current Plan</h2>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-emerald-400 font-bold text-sm">AI Operations Platform</span>
            <p className="text-stone-500 text-xs mt-1">Pay-as-you-go · Active AI employees billed monthly</p>
          </div>
          <Link to="/portal/marketplace" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors">
            Manage Plan
          </Link>
        </div>
      </div>

      {/* Payment method */}
      <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-black text-white">Payment Method</h2>
        <p className="text-stone-500 text-sm">Payment methods are managed through Stripe. Add or update your card on file.</p>
        <a href="https://billing.stripe.com" target="_blank" rel="noopener noreferrer"
           className="inline-block bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs px-4 py-2 rounded-xl border border-stone-800 transition-colors">
          Manage in Stripe →
        </a>
      </div>

      {/* Invoice history */}
      <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-black text-white">Invoice History</h2>
        {invoices.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-stone-800 rounded-xl">
            <p className="text-stone-400 font-bold text-sm">No invoices yet</p>
            <p className="text-stone-500 text-xs mt-1">Invoices appear here after your first AI employee is deployed.</p>
            <Link to="/portal/marketplace" className="inline-block mt-3 text-emerald-400 font-bold text-sm hover:text-emerald-300">
              Browse AI Employees →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-stone-500 border-b border-stone-800">
                  <th className="py-3 px-4 font-bold">Date</th>
                  <th className="py-3 px-4 font-bold">Description</th>
                  <th className="py-3 px-4 font-bold text-right">Amount</th>
                  <th className="py-3 px-4 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900">
                {invoices.map((inv: any, i: number) => (
                  <tr key={i} className="text-stone-300">
                    <td className="py-3 px-4">{inv.date || inv.purchasedAt || "—"}</td>
                    <td className="py-3 px-4 font-bold text-white">{inv.type || inv.productName || inv.agentName || "Subscription"}</td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-400">{inv.amount || "$0"}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        {inv.status || "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
