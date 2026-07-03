import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, Badge, Input } from "~/components/ui";

export const Route = createFileRoute("/portal/admin/billing")({
  component: AdminBilling,
});

interface Subscription {
  id: string;
  company: string;
  planName: string;
  mrr: number;
  status: "active" | "cancelled" | "past_due";
  joinedDate: string;
}

const initialSubscriptions: Subscription[] = [
  { id: "SUB-01", company: "Energy Corp", planName: "Professional Monthly Ops", mrr: 2000.00, status: "active", joinedDate: "2026-06-28" },
  { id: "SUB-02", company: "Fast Logistics", planName: "Essential Monthly Ops", mrr: 750.00, status: "active", joinedDate: "2026-06-30" },
  { id: "SUB-03", company: "AutoParts LLC", planName: "Essential Monthly Ops", mrr: 750.00, status: "past_due", joinedDate: "2026-07-02" },
];

function AdminBilling() {
  const [subs] = useState<Subscription[]>(initialSubscriptions);
  const [search, setSearch] = useState("");

  const filteredSubs = subs.filter(s => 
    s.company.toLowerCase().includes(search.toLowerCase()) || 
    s.planName.toLowerCase().includes(search.toLowerCase())
  );

  const totalMRR = subs.reduce((acc, s) => acc + (s.status === "active" ? s.mrr : 0), 0);

  return (
    <div className="space-y-10 animate-in fade-in duration-200">
      {/* Header section */}
      <div className="border-b border-slate-800 pb-6">
        <h1 className="text-3xl font-black text-white">System Billing Ledger</h1>
        <p className="text-slate-400 text-sm mt-1">Review system-wide recurring revenue metrics, track plan subscription tiers, and audit active invoice logs.</p>
      </div>

      {/* Revenue stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Monthly Recurring Revenue (MRR)</div>
          <div className="text-3xl font-black text-white">${totalMRR.toLocaleString()}</div>
          <p className="text-xs text-indigo-400 font-bold mt-2">Active paid subscriptions</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Estimated ARR</div>
          <div className="text-3xl font-black text-emerald-400">${(totalMRR * 12).toLocaleString()}</div>
          <p className="text-xs text-emerald-500 font-bold mt-2">Annualized run rate</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Outstanding Dues</div>
          <div className="text-3xl font-black text-rose-500">$750.00</div>
          <p className="text-xs text-rose-500 font-bold mt-2">1 active past due invoice</p>
        </div>
      </div>

      {/* Subscription table */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-black text-white">Active Subscriber Accounts</h2>
          <div className="w-full max-w-xs">
            <Input 
              placeholder="🔍 Filter by company or plan..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-950 border-slate-800 focus:border-indigo-500 text-white py-1 px-3 text-xs"
            />
          </div>
        </div>

        <Card className="overflow-hidden bg-slate-900 border-slate-800 shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950 text-xs font-black uppercase text-slate-500 tracking-wider">
                <th className="p-4 pl-6">Subscription ID</th>
                <th className="p-4">Customer Account</th>
                <th className="p-4">Subscribed Plan Tier</th>
                <th className="p-4">MRR Amount</th>
                <th className="p-4">Billing Status</th>
                <th className="p-4 pr-6">Started Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredSubs.map((s) => (
                <tr key={s.id} className="hover:bg-slate-850/50 transition-colors text-sm">
                  <td className="p-4 pl-6 font-mono font-bold text-slate-500">{s.id}</td>
                  <td className="p-4 font-bold text-slate-200">{s.company}</td>
                  <td className="p-4 text-slate-400 font-semibold">{s.planName}</td>
                  <td className="p-4 font-mono font-bold text-indigo-400">${s.mrr.toLocaleString()}</td>
                  <td className="p-4">
                    <Badge variant={s.status === "active" ? "success" : s.status === "past_due" ? "danger" : "slate"}>
                      {s.status}
                    </Badge>
                  </td>
                  <td className="p-4 pr-6 text-slate-400 font-semibold">{s.joinedDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
