import { Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

interface BillingInvoice {
  id: string;
  date: string | null;
  description: string | null;
  amount: number | null;
  status: string | null;
  pdfUrl: string | null;
}
interface BillingSubscription {
  planName: string | null;
  tier: string | null;
  amount: number | null;
  interval: "month" | "year" | null;
  status: string | null;
  purchasedAt: string | null;
  currentPeriodEnd: string | null;
  // Slice 139 — real subscription lifecycle state written by the Stripe
  // webhook (cancel / failed card / recovery). Null when we do not know.
  access?: "active" | "at_risk" | "revoked" | null;
  dunning?: { active: boolean; since: string | null; attemptCount: number } | null;
  canceledAt?: string | null;
}
interface NativeBillingView {
  source: "stripe" | "durable" | "none";
  subscription: BillingSubscription | null;
  invoices: BillingInvoice[];
  paymentMethod: { brand: string; last4: string } | null;
}

/**
 * SLICE 142 — the tier + limits block comes from /api/native/entitlements,
 * which is the SAME helper the enforcement gates call. The page therefore
 * cannot promise more than the gate allows: every row is generated from
 * TIER_SPECS and labelled "enforced" or "included" (stated, not yet gated).
 */
interface EntitlementView {
  entitlement: {
    tier: string;
    label: string;
    tierSource: string;
    uncertain: boolean;
    access: string;
    planName: string | null;
    note: string;
    limits: { importRowsPerMonth: number | null; seats: number | null };
    features: Record<string, boolean>;
  };
  view: { rows: { label: string; value: string; status: "enforced" | "stated" | "not-built" }[]; notes: string[] };
  importUsage: { monthKey: string; used: number; limit: number | null; remaining: number | null };
}

const usd = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};
const statusBadge = (status: string | null) => {
  const s = (status || "").toLowerCase();
  const tone = s === "paid" || s === "active" ? "bg-emerald-950/40 text-emerald-400" : "bg-stone-900 text-stone-300";
  return <span className={`${tone} px-2 py-0.5 rounded-full text-[10px] font-bold`}>{status || "recorded"}</span>;
};

function BillingPage() {
  const [billing, setBilling] = useState<NativeBillingView | null>(null);
  const [ent, setEnt] = useState<EntitlementView | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/native/billing", { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setBilling(d?.billing ?? { source: "none", subscription: null, invoices: [], paymentMethod: null }))
      .catch(() => setBilling({ source: "none", subscription: null, invoices: [], paymentMethod: null }))
      .finally(() => setLoading(false));
    // Same helper the gates use — the limits shown here are the limits enforced.
    fetch("/api/native/entitlements", { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setEnt(d && d.view ? (d as EntitlementView) : null))
      .catch(() => setEnt(null));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
    </div>
  );

  const sub = billing?.subscription ?? null;
  const invoices = billing?.invoices ?? [];
  const paymentMethod = billing?.paymentMethod ?? null;
  const hasAny = sub !== null || invoices.length > 0;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">💳 Billing & Subscriptions</h1>
        <p className="text-stone-400 text-sm mt-1">Your plan, payments, and invoice history — straight from Stripe.</p>
      </div>

      {/* Current plan */}
      <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-black text-white">Current Plan</h2>
        {sub ? (
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold text-lg">{sub.planName || "Platform subscription"}</span>
                {statusBadge(sub.status)}
              </div>
              <p className="text-stone-500 text-xs mt-1">
                {usd(sub.amount)}{sub.interval ? ` / ${sub.interval}` : ""}
                {sub.currentPeriodEnd ? ` · renews ${fmtDate(sub.currentPeriodEnd)}` : ""}
                {sub.purchasedAt ? ` · on file since ${fmtDate(sub.purchasedAt)}` : ""}
              </p>
              {/* Slice 139 — say what the state actually IS. A cancelled plan
                  or a failing card must never read "active" here. */}
              {sub.access === "revoked" && (
                <p className="text-rose-400 text-xs font-bold mt-2">
                  Subscription {sub.status === "unpaid" ? "unpaid" : "cancelled"}
                  {sub.canceledAt ? ` on ${fmtDate(sub.canceledAt)}` : ""} — access has ended.
                </p>
              )}
              {sub.access === "at_risk" && sub.dunning?.active && (
                <p className="text-amber-400 text-xs font-bold mt-2">
                  Payment failed{sub.dunning.since ? ` on ${fmtDate(sub.dunning.since)}` : ""}
                  {sub.dunning.attemptCount > 1 ? ` (attempt ${sub.dunning.attemptCount})` : ""} — access continues while the card is retried.
                </p>
              )}
              {billing?.source === "durable" && (
                <p className="text-stone-600 text-[11px] mt-2">
                  Recorded from your Stripe checkout and the Stripe billing events on your account.
                </p>
              )}
            </div>
            <Link to="/pricing" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors">
              Manage Plan
            </Link>
          </div>
        ) : (
          <div className="text-center py-10 border border-dashed border-stone-800 rounded-xl">
            <p className="text-stone-300 font-bold text-sm">No subscription on file</p>
            <p className="text-stone-500 text-xs mt-1 max-w-sm mx-auto">
              You don't have a plan on file yet. The free primitives — forms, tables, dashboards and the
              knowledge base — and the full quote-to-cash chain stay open; choose a tier for scale limits,
              the automation control plane and support.
            </p>
            <Link to="/pricing" className="inline-block mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">
              View Pricing →
            </Link>
          </div>
        )}
      </div>

      {/* Plan limits — generated by the SAME helper the gates enforce with. */}
      {ent && (
        <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-black text-white">Your plan and limits</h2>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
              Enforced by the platform
            </span>
          </div>
          <p className="text-stone-500 text-xs">{ent.entitlement.note}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-stone-500 border-b border-stone-800">
                  <th className="py-2 pr-4 font-bold">Included</th>
                  <th className="py-2 pr-4 font-bold">Your plan</th>
                  <th className="py-2 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900">
                {ent.view.rows.map((row) => (
                  <tr key={row.label} className="text-stone-300">
                    <td className="py-2 pr-4 text-stone-400">{row.label}</td>
                    <td className="py-2 pr-4 font-bold text-white">{row.value}</td>
                    <td className="py-2 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.status === "enforced"
                            ? "bg-emerald-950/40 text-emerald-400"
                            : "bg-stone-900 text-stone-400"
                        }`}
                      >
                        {row.status === "enforced" ? "enforced" : row.status === "not-built" ? "not built yet" : "included"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-stone-500 space-y-1">
            <p>
              Imported rows used in {ent.importUsage.monthKey}: <span className="text-stone-300 font-bold">{ent.importUsage.used.toLocaleString("en-US")}</span>
              {ent.importUsage.limit === null
                ? " — no monthly cap on your plan."
                : ` of ${ent.importUsage.limit.toLocaleString("en-US")} (resets on the 1st).`}
            </p>
            {ent.view.notes.map((n) => <p key={n}>{n}</p>)}
          </div>
        </div>
      )}

      {/* Payment method */}
      <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-black text-white">Payment Method</h2>
        {paymentMethod ? (
          <div className="flex items-center justify-between">
            <p className="text-stone-300 text-sm">
              <span className="font-bold text-white">{paymentMethod.brand}</span> •••• {paymentMethod.last4}
            </p>
            <p className="text-stone-500 text-[11px]">Card on file in Stripe</p>
          </div>
        ) : (
          <p className="text-stone-500 text-sm">
            No payment method on file. Card details are collected securely by Stripe at checkout.
          </p>
        )}
      </div>

      {/* Invoice history */}
      <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Invoice History</h2>
          {billing?.source === "durable" && invoices.length > 0 && (
            <span className="text-stone-600 text-[10px] font-semibold">RECORDED FROM YOUR STRIPE CHECKOUT</span>
          )}
        </div>
        {invoices.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-stone-800 rounded-xl">
            <p className="text-stone-400 font-bold text-sm">No invoices yet</p>
            <p className="text-stone-500 text-xs mt-1">Invoices appear here after your first Stripe invoice is issued.</p>
            <Link to="/pricing" className="inline-block mt-3 text-emerald-400 font-bold text-sm hover:text-emerald-300">
              View Pricing →
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
                  <th className="py-3 px-4 font-bold text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900">
                {invoices.map(inv => (
                  <tr key={inv.id} className="text-stone-300">
                    <td className="py-3 px-4">{fmtDate(inv.date)}</td>
                    <td className="py-3 px-4 font-bold text-white">{inv.description || "Platform subscription"}</td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-400">{usd(inv.amount)}</td>
                    <td className="py-3 px-4 text-right">{statusBadge(inv.status)}</td>
                    <td className="py-3 px-4 text-right">
                      {inv.pdfUrl ? (
                        <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 font-bold hover:text-emerald-300">PDF →</a>
                      ) : (
                        <span className="text-stone-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {billing?.source === "durable" && (
              <p className="text-stone-600 text-[10px] mt-3">
                Listed from the purchase events recorded on your account. Live Stripe invoices appear here once secure billing access is enabled.
              </p>
            )}
          </div>
        )}
        {!hasAny && (
          <p className="text-center text-stone-600 text-[11px]">
            Need help deciding? <Link to="/assessment" className="text-emerald-400 font-bold hover:text-emerald-300">Start with the free assessment ←</Link>
          </p>
        )}
      </div>
    </div>
  );
}
export default BillingPage;