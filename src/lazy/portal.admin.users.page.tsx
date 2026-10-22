import { useState, useEffect } from "react";
import { PortalEmptyState } from "~/components/PortalEmptyState";
// P1-2 honesty: this page previously rendered HARDCODED demo rows
// (hardcoded demo accounts with fake "joined" dates) and dead
// Edit/Suspend buttons. It now renders the REAL registered accounts from
// /api/data/users (users.json) only.
function AdminUsersPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/data/users", { credentials: "include" })
      .then(r => r.json()).then(d => {
        const rows = d.data || [];
        setUsers(rows);
        setStats({
          total: rows.length,
          registered: rows.length,
          admins: rows.filter((u: any) => u.role === "admin" || u.role === "owner").length,
          clients: rows.filter((u: any) => u.role !== "admin" && u.role !== "owner").length,
        });
      }).catch(() => {});
  }, []);
  const fmtJoined = (u: any) => {
    const t = u?.createdAt ? new Date(u.createdAt).getTime() : NaN;
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "—";
  };
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">User Management</h1>
        <p className="text-stone-400 mt-1">Registered accounts, roles, and access.</p>
      </div>
      {/* Stats Row — real counts from users.json */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: String(stats.total || "—"), color: "text-white" },
          { label: "Registered", value: String(stats.registered || "—"), color: "text-emerald-400" },
          { label: "Admins", value: String(stats.admins || "—"), color: "text-amber-400" },
          { label: "Clients", value: String(stats.clients || "—"), color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-stone-500 text-xs font-mono mt-1">{s.label}</div>
          </div>
        ))}
      </div>
      {/* Users Table — real users from users.json */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-stone-950 border-b border-stone-800 text-[10px] font-mono text-stone-500 uppercase tracking-wider font-bold">
          <div className="col-span-4">Email</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Joined</div>
          <div className="col-span-2" />
        </div>
        <div className="divide-y divide-stone-800">
          {users.length === 0 ? (
            <div className="px-6 py-6">
              <PortalEmptyState
                compact
                title="No registered accounts yet"
                body="Accounts appear here after their first signup."
              />
            </div>
          ) : (
            users.map((user: any) => (
              <div key={user.id || user.email} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-stone-800/30 transition-colors">
                <div className="col-span-4 text-white text-xs font-bold truncate">{user.email}</div>
                <div className="col-span-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    user.role === "admin" || user.role === "owner" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                    "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  }`}>{user.role || "user"}</span>
                </div>
                <div className="col-span-2">
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Registered
                  </span>
                </div>
                <div className="col-span-2 text-xs text-stone-400 font-mono">{fmtJoined(user)}</div>
                <div className="col-span-2 text-right text-[10px] text-stone-600 font-mono">—</div>
              </div>
            ))
          )}
        </div>
      </div>
      {/* Invite — not wired yet: honest disabled note (P1-2) */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
        <h3 className="text-white font-bold mb-2">Invite New User</h3>
        <p className="text-xs text-stone-500">Invites aren't available yet — accounts are created during onboarding.</p>
      </div>
    </div>
  );
}
export default AdminUsersPage;