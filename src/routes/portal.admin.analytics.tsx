import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/portal/admin/analytics")({
  component: AdminAnalyticsPage,
});

function AdminAnalyticsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Platform Analytics</h1>
        <p className="text-stone-400 mt-1">Global usage metrics across all customers and AI employees.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total API Calls", value: "847,291", color: "text-white" },
          { label: "Active AI Agents", value: "24", color: "text-emerald-400" },
          { label: "Documents Processed", value: "12,403", color: "text-blue-400" },
          { label: "Uptime", value: "99.97%", color: "text-amber-400" },
        ].map(s => (
          <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-stone-500 text-xs font-mono mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Charts Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
          <h3 className="text-sm font-black text-white mb-1">API Usage — Last 30 Days</h3>
          <p className="text-[10px] text-stone-500 font-mono mb-4">Total requests across all tenants</p>
          <div className="space-y-2">
            {[
              { label: "OpenAI", pct: 45, color: "bg-emerald-500" },
              { label: "Document Processing", pct: 28, color: "bg-blue-500" },
              { label: "Integrations", pct: 15, color: "bg-amber-500" },
              { label: "Auth & Sessions", pct: 8, color: "bg-purple-500" },
              { label: "Other", pct: 4, color: "bg-stone-500" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-[10px] text-stone-400 w-36">{item.label}</span>
                <div className="flex-1 bg-stone-950 rounded-full h-2 overflow-hidden">
                  <div className={`${item.color} h-full rounded-full`} style={{ width: `${item.pct}%` }} />
                </div>
                <span className="text-[10px] text-stone-500 font-mono w-8 text-right">{item.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
          <h3 className="text-sm font-black text-white mb-1">Customer Growth</h3>
          <p className="text-[10px] text-stone-500 font-mono mb-4">New accounts per month</p>
          <div className="flex items-end gap-2 h-40">
            {[2, 3, 3, 4, 5, 4, 6, 5, 7, 8, 8, 9].map((val, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-emerald-600 rounded-t-lg transition-all hover:bg-emerald-500"
                  style={{ height: `${(val / 9) * 100}%` }} />
                <span className="text-[8px] text-stone-500 font-mono">{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Customers */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-stone-950 border-b border-stone-800 text-[10px] font-mono text-stone-500 uppercase tracking-wider font-bold">
          <div className="col-span-4">Customer</div>
          <div className="col-span-2">AI Agents</div>
          <div className="col-span-2">Workflows</div>
          <div className="col-span-2">API Calls (30d)</div>
          <div className="col-span-2">Status</div>
        </div>
        <div className="divide-y divide-stone-800">
          {[
            { name: "mathewortiz97@gmail.com", agents: 8, workflows: 12, calls: "342K", status: "Active" },
            { name: "demo@test.com", agents: 5, workflows: 7, calls: "198K", status: "Active" },
            { name: "newclient@test.com", agents: 3, workflows: 4, calls: "87K", status: "Active" },
          ].map(c => (
            <div key={c.name} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-stone-800/30 transition-colors">
              <div className="col-span-4 text-white text-xs font-bold truncate">{c.name}</div>
              <div className="col-span-2 text-xs text-stone-300">{c.agents}</div>
              <div className="col-span-2 text-xs text-stone-300">{c.workflows}</div>
              <div className="col-span-2 text-xs text-stone-300 font-mono">{c.calls}</div>
              <div className="col-span-2">
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {c.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
