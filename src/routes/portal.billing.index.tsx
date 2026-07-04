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

  const handleManagePortal = async () => {
    try {
      const res = await fetch("/api/billing/portal", { credentials: "include" });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-stone-200 pb-6">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">💳 Plan & Billing</h1>
        <p className="text-stone-500 mt-1">Review active subscriptions, analyze real-time resource usage, and download financial invoices.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <span className="text-[10px] font-black uppercase text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full">Active Plan</span>
            <h3 className="text-2xl font-black text-stone-900">Starter Implementation</h3>
            <p className="text-stone-500 text-xs leading-relaxed font-semibold">Includes 2 active AI employees, 3 operational workflows, 30 days of standard tech support.</p>
          </div>
          <button onClick={handleManagePortal} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 rounded-xl shadow-lg transition-all">💳 Manage via Stripe Portal</button>
        </div>

        <div className="lg:col-span-2 bg-white border border-stone-200 rounded-3xl p-6 shadow-sm space-y-6">
          <h3 className="text-lg font-black text-stone-900">Invoice History</h3>
          <div className="divide-y divide-stone-100 text-xs font-semibold text-stone-600">
            {invoices.map((inv, idx) => (
              <div key={idx} className="flex justify-between items-center py-3">
                <div>
                  <div className="font-bold text-stone-900">{inv.type}</div>
                  <div className="text-[10px] text-stone-400">{inv.date} • {inv.id}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-bold text-stone-950">{inv.amount}</span>
                  <button onClick={() => handleDownload(inv.id)} className="text-emerald-600 hover:underline">Download</button>
                </div>
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