import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
export const Route = createFileRoute("/portal/billing/")({
  component: BillingPage,
});
function BillingPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Plan-included Connection Pack slot (owner decision 2026-08-14):
  // every plan purchase includes 1 pack slot — CRM or ERP, tenant's choice.
  const [packSlot, setPackSlot] = useState<{ included: boolean; chosen: string | null } | null>(null);
  const [packBusy, setPackBusy] = useState(false);
  const [packError, setPackError] = useState("");
  useEffect(() => {
    fetch("/api/data/billing", { credentials: "include" })
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => { setInvoices(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
    fetch("/api/portal/pack-slot", { credentials: "include" })
      .then(r => r.ok ? r.json() : { data: null })
      .then((d: any) => { if (d?.data) setPackSlot(d.data); })
      .catch(() => { /* endpoint missing on older instances — hide the card */ });
  }, []);
  const choosePack = async (choice: "crm" | "erp") => {
    setPackBusy(true);
    setPackError("");
    try {
      const r = await fetch("/api/portal/pack-slot", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setPackError(j?.error || "Could not redeem the included Connection Pack.");
        setPackBusy(false);
        return;
      }
      setPackSlot(j.data || { included: true, chosen: choice });
    } catch {
      setPackError("Could not redeem the included Connection Pack.");
    }
    setPackBusy(false);
  };
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
      {/* Included Connection Pack (plan benefit) */}
      {packSlot?.included && (
        <div className="bg-stone-950 border border-emerald-900/50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-white">Included Connection Pack</h2>
              <p className="text-stone-500 text-xs mt-1">
                Your plan includes 1 Connection Pack — choose CRM or ERP to activate it.
              </p>
            </div>
            {packSlot.chosen && (
              <span className="bg-emerald-600 text-black text-xs font-bold px-3 py-1 rounded-full">
                {packSlot.chosen === "crm" ? "CRM Pack active" : "ERP Pack active"}
              </span>
            )}
          </div>
          {!packSlot.chosen ? (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => choosePack("crm")}
                disabled={packBusy}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black font-bold text-xs px-5 py-2.5 rounded-xl transition-colors"
              >
                Choose CRM Pack
              </button>
              <button
                onClick={() => choosePack("erp")}
                disabled={packBusy}
                className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl border border-stone-700 transition-colors"
              >
                Choose ERP Pack
              </button>
            </div>
          ) : (
            <p className="text-stone-400 text-sm">
              {packSlot.chosen === "crm"
                ? "CRM Connection Pack is active on your account. Connect Salesforce, HubSpot, Zoho and more from the Marketplace."
                : "ERP Connection Pack is active on your account. Connect NetSuite, Sage, SAP and more from the Marketplace."}
            </p>
          )}
          {packError && <p className="text-red-400 text-xs font-bold">{packError}</p>}
          <p className="text-stone-600 text-[11px]">
            Need both? Standalone CRM ($2,000) and ERP ($3,500) Connection Packs are still available in the Marketplace — buying one adds capacity beyond your included slot.
          </p>
        </div>
      )}
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
